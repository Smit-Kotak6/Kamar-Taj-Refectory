import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowDownRight,
  Ban,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock,
  Info,
  Leaf,
  RefreshCw,
  TrendingUp,
  Users,
  Utensils,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  ApiError,
  MEAL_TYPES,
  MESS_CLOSED_LABEL,
  getAdminOverview,
  getForecast,
  getMeals,
  getNotifications,
  getWasteStats,
} from "../../api";
import type {
  AdminMealStat,
  AdminOverview,
  ForecastPoint,
  Meal,
  MealType,
  Notification,
  NotificationKind,
  WasteStat,
} from "../../api";
import { cx } from "../../lib/cx";
import { useCountdown } from "../../hooks/useCountdown";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { GradientHero } from "../../components/ui/GradientHero";
import { StatCard } from "../../components/ui/StatCard";
import type { StatTrend } from "../../components/ui/StatCard";

// ------------------------------------------------------------------ constants

/**
 * DEMO VALUE: the API has no "waste reduced vs baseline" figure yet.
 * Replace with a real api function (e.g. getWasteReduction()) when the policy exists.
 */
const DEMO_FOOD_WASTE_REDUCED_PCT = 68;

const ORANGE = "#F26B3A";
const PINK = "#F2597A";
const PURPLE = "#7B5CE6";
const GRID = "#F1E4D8";
const AXIS_TEXT = "rgba(22, 33, 47, 0.55)";

const MEAL_LABEL: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

type MealFilter = MealType | "all";

const FILTER_OPTIONS: { value: MealFilter; label: string }[] = [
  { value: "all", label: "All meals" },
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
];

// -------------------------------------------------------------------- loading

type Forecasts = Record<MealType, ForecastPoint[]>;

interface DashboardData {
  overview: AdminOverview;
  forecasts: Forecasts;
  waste: WasteStat[];
  meals: Meal[];
  notifications: Notification[];
}

async function loadDashboard(): Promise<DashboardData> {
  const [overview, breakfast, lunch, dinner, waste, notifications] = await Promise.all([
    getAdminOverview(),
    getForecast("breakfast"),
    getForecast("lunch"),
    getForecast("dinner"),
    getWasteStats(30),
    getNotifications(),
  ]);
  const meals = await getMeals(overview.date);
  return {
    overview,
    forecasts: { breakfast, lunch, dinner },
    waste,
    meals,
    notifications,
  };
}

// ------------------------------------------------------------------ formatters

function parseDay(date: string): Date {
  return new Date(`${date}T00:00:00`);
}

function weekdayShort(date: string): string {
  return parseDay(date).toLocaleDateString("en-US", { weekday: "short" });
}

/** "Mon 28" */
function formatTick(date: string): string {
  return `${weekdayShort(date)} ${parseDay(date).getDate()}`;
}

/** "Fri, 2 May" */
function formatLongDate(date: string): string {
  const d = parseDay(date);
  const month = d.toLocaleDateString("en-US", { month: "short" });
  return `${weekdayShort(date)}, ${d.getDate()} ${month}`;
}

function formatTime(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    .replace(" AM", " AM")
    .replace(" PM", " PM");
}

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatKg(value: number): string {
  return `${Math.round(value).toLocaleString("en-IN")} kg`;
}

/** Turns a percentage change into a StatCard trend chip. */
function toTrend(value: number, goodWhen: "up" | "down" = "up"): StatTrend {
  const direction = Math.abs(value) < 0.05 ? "flat" : value > 0 ? "up" : "down";
  const sentiment =
    direction === "flat"
      ? "neutral"
      : (direction === "up") === (goodWhen === "up")
        ? "positive"
        : "negative";
  return { label: `${Math.abs(value).toFixed(1).replace(/\.0$/, "")}%`, direction, sentiment };
}

// ------------------------------------------------------------- data shaping

interface ChartRow {
  date: string;
  /** Actual head-count; null from today onwards (the API has no future actuals). */
  confirmed: number | null;
  predicted: number;
}

function buildChartRows(forecasts: Forecasts, filter: MealFilter): ChartRow[] {
  const types: MealType[] = filter === "all" ? MEAL_TYPES : [filter];
  return forecasts[types[0]].map((point, index) => {
    let predicted = 0;
    let confirmed = 0;
    let hasActual = false;
    for (const type of types) {
      const p = forecasts[type][index];
      predicted += p.predicted;
      if (p.actual !== null) {
        confirmed += p.actual;
        hasActual = true;
      }
    }
    return { date: point.date, predicted, confirmed: hasActual ? confirmed : null };
  });
}

function predictedOn(forecasts: Forecasts, date: string): number {
  return MEAL_TYPES.reduce((sum, type) => {
    const point = forecasts[type].find((p) => p.date === date);
    return sum + (point?.predicted ?? 0);
  }, 0);
}

function sumWaste(stats: WasteStat[]) {
  return stats.reduce(
    (acc, s) => ({
      prepared: acc.prepared + s.preparedKg,
      consumed: acc.consumed + s.consumedKg,
      wasted: acc.wasted + s.wastedKg,
    }),
    { prepared: 0, consumed: 0, wasted: 0 },
  );
}

// -------------------------------------------------------------- small pieces

function CardTitle({
  icon: Icon,
  title,
  subtitle,
  action,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-peach text-accent"
          aria-hidden="true"
        >
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <h2 className="truncate font-serif text-lg font-semibold leading-tight text-ink sm:text-xl">
            {title}
          </h2>
          {subtitle ? <p className="truncate text-sm text-ink/60">{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-2xl bg-[#F1E4D8]/70", className)} />;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <Skeleton className="h-56 rounded-3xl" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
    </div>
  );
}

// ------------------------------------------------------- cancellation cutoff

function CutoffStat({ meals }: { meals: AdminMealStat[] }) {
  const [now, setNow] = useState(() => Date.now());

  const next = useMemo(() => {
    return (
      meals
        .filter((m) => !m.closed && new Date(m.cutoffAt).getTime() > now)
        .sort((a, b) => new Date(a.cutoffAt).getTime() - new Date(b.cutoffAt).getTime())[0] ??
      null
    );
  }, [meals, now]);

  const { formatted, isExpired } = useCountdown(next?.cutoffAt);

  // When the running countdown hits zero, move on to the next meal's cutoff.
  useEffect(() => {
    if (next && isExpired) setNow(Date.now());
  }, [next, isExpired]);

  return (
    <StatCard
      label="Cancellation Cutoff"
      icon={Clock}
      tone="lilac"
      value={next ? formatted : "Closed"}
      valueClassName="text-accent"
      subtitle={
        next ? `left for ${MEAL_LABEL[next.mealType]}` : "All of today's cutoffs have passed"
      }
    />
  );
}

// ------------------------------------------------------------ demand chart

interface TooltipEntry {
  dataKey?: string | number;
  value?: number | string | null;
}

interface DemandTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: ReadonlyArray<TooltipEntry>;
}

function DemandTooltip({ active, label, payload }: DemandTooltipProps) {
  if (!active || !payload || payload.length === 0 || typeof label !== "string") return null;

  const valueOf = (key: string): number | null => {
    const entry = payload.find((p) => p.dataKey === key);
    return typeof entry?.value === "number" ? entry.value : null;
  };
  const predicted = valueOf("predicted");
  const confirmed = valueOf("confirmed");

  const rows = [
    { name: "Predicted", color: PURPLE, value: predicted },
    { name: "Confirmed", color: ORANGE, value: confirmed },
  ];

  return (
    <div className="rounded-xl border border-line bg-card px-3.5 py-2.5 shadow-soft">
      <p className="mb-1.5 text-sm font-semibold text-ink">{formatLongDate(label)}</p>
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.name} className="flex items-center gap-2 text-sm text-ink/80">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: row.color }}
              aria-hidden="true"
            />
            <span>{row.name}:</span>
            <span className="font-medium tabular-nums text-ink">
              {row.value === null ? "—" : row.value.toLocaleString("en-IN")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChartLegend() {
  return (
    <div className="flex items-center gap-4 text-sm text-ink/70">
      <span className="inline-flex items-center gap-2">
        <span className="h-0.5 w-5 rounded-full" style={{ backgroundColor: ORANGE }} aria-hidden="true" />
        Confirmed
      </span>
      <span className="inline-flex items-center gap-2">
        <span
          className="w-5 border-t-2 border-dashed"
          style={{ borderColor: PURPLE }}
          aria-hidden="true"
        />
        Predicted
      </span>
    </div>
  );
}

function DemandTrendCard({ forecasts, today }: { forecasts: Forecasts; today: string }) {
  const [filter, setFilter] = useState<MealFilter>("all");
  const rows = useMemo(() => buildChartRows(forecasts, filter), [forecasts, filter]);

  return (
    <Card as="section" padding="md" aria-label="Meal demand trend">
      <CardTitle
        icon={BarChart3}
        title="Meal Demand Trend"
        subtitle="Confirmed vs predicted meals · last 7 days and next 7 days"
        action={
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as MealFilter)}
            aria-label="Meal type"
            className="h-9 rounded-xl border border-line bg-white px-3 text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            {FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        }
      />

      <div className="mb-2">
        <ChartLegend />
      </div>

      <div className="h-64 w-full sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="confirmedFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FF9A5A" stopOpacity={0.6} />
                <stop offset="55%" stopColor={PINK} stopOpacity={0.35} />
                <stop offset="100%" stopColor={PURPLE} stopOpacity={0.12} />
              </linearGradient>
              <linearGradient id="predictedFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={PURPLE} stopOpacity={0.16} />
                <stop offset="100%" stopColor={PURPLE} stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatTick}
              tick={{ fill: AXIS_TEXT, fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: GRID }}
              interval="preserveStartEnd"
              minTickGap={18}
            />
            <YAxis
              tick={{ fill: AXIS_TEXT, fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={44}
              allowDecimals={false}
            />
            <Tooltip content={<DemandTooltip />} cursor={{ stroke: PINK, strokeDasharray: "4 4" }} />
            <ReferenceLine
              x={today}
              stroke={ORANGE}
              strokeDasharray="3 3"
              label={{ value: "Today", position: "top", fill: ORANGE, fontSize: 11 }}
            />

            <Area
              type="monotone"
              dataKey="predicted"
              stroke={PURPLE}
              strokeWidth={2.5}
              strokeDasharray="6 6"
              fill="url(#predictedFill)"
              dot={false}
              activeDot={{ r: 5, fill: PURPLE, stroke: "#fff", strokeWidth: 2 }}
            />
            <Area
              type="monotone"
              dataKey="confirmed"
              stroke={ORANGE}
              strokeWidth={2.5}
              fill="url(#confirmedFill)"
              connectNulls={false}
              dot={false}
              activeDot={{ r: 5, fill: ORANGE, stroke: "#fff", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------ today's menu

function TodaysMenuCard({ meals, stats }: { meals: Meal[]; stats: AdminMealStat[] }) {
  const ordered = useMemo(
    () => [...meals].sort((a, b) => MEAL_TYPES.indexOf(a.type) - MEAL_TYPES.indexOf(b.type)),
    [meals],
  );

  return (
    <Card as="section" padding="md" aria-label="Today's menu">
      <CardTitle icon={Utensils} title="Today's Menu" subtitle="Opt-ins per meal" />

      <ul className="space-y-3">
        {ordered.map((meal) => {
          const stat = stats.find((s) => s.mealType === meal.type);
          const booked = stat?.booked ?? 0;
          const cutoffPassed = stat ? new Date(stat.cutoffAt).getTime() <= Date.now() : true;
          const closed = meal.closed || stat?.closed === true;

          return (
            <li
              key={meal.id}
              className={cx(
                "flex items-center gap-3 rounded-2xl border border-line bg-white/60 p-2.5 sm:gap-4",
                closed && "opacity-90",
              )}
            >
              <img
                src={meal.image}
                alt=""
                className={cx(
                  "size-16 shrink-0 rounded-xl object-cover sm:size-20",
                  closed && "grayscale",
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <h3 className="font-semibold text-ink">{MEAL_LABEL[meal.type]}</h3>
                  {closed ? (
                    <Badge variant="danger" icon={Ban}>
                      {MESS_CLOSED_LABEL}
                    </Badge>
                  ) : cutoffPassed ? (
                    <Badge variant="success">{booked.toLocaleString("en-IN")} opted</Badge>
                  ) : (
                    <Badge variant="info">{booked.toLocaleString("en-IN")} opted so far</Badge>
                  )}
                </div>
                <p className="text-sm text-ink/65">
                  {formatTime(meal.serviceStart)} – {formatTime(meal.serviceEnd)}
                </p>
                <p className="truncate text-sm text-ink/60">{meal.title}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// -------------------------------------------------------- waste reduction

function WasteReductionCard({
  waste,
  avgWastePct,
  wasteTrendPct,
}: {
  waste: WasteStat[];
  avgWastePct: number;
  wasteTrendPct: number;
}) {
  const totals = useMemo(() => sumWaste(waste), [waste]);
  const ring = [
    { name: "Reduced", value: DEMO_FOOD_WASTE_REDUCED_PCT },
    { name: "Remaining", value: 100 - DEMO_FOOD_WASTE_REDUCED_PCT },
  ];
  const legend = [
    { label: "Total Prepared", value: totals.prepared, color: PURPLE },
    { label: "Consumed", value: totals.consumed, color: "#1F7A4D" },
    { label: "Waste", value: totals.wasted, color: ORANGE },
  ];
  const trend = toTrend(wasteTrendPct, "down");

  return (
    <Card as="section" padding="md" aria-label="Waste reduction">
      <CardTitle icon={Leaf} title="Waste Reduction" subtitle="Last 30 days" />

      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
        <div className="relative size-44 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <defs>
                <linearGradient id="wasteRing" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#7BD9A5" />
                  <stop offset="100%" stopColor="#1F7A4D" />
                </linearGradient>
              </defs>
              <Pie
                data={ring}
                dataKey="value"
                startAngle={90}
                endAngle={-270}
                innerRadius="78%"
                outerRadius="100%"
                stroke="none"
                cornerRadius={8}
                isAnimationActive={false}
              >
                <Cell fill="url(#wasteRing)" />
                <Cell fill="#E3F4EA" />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="font-serif text-4xl font-semibold leading-none text-ink tabular-nums">
              {DEMO_FOOD_WASTE_REDUCED_PCT}%
            </span>
            <span className="mt-1 max-w-[6.5rem] text-xs leading-tight text-ink/65">
              Food Waste Reduced
            </span>
          </div>
        </div>

        <ul className="w-full space-y-3">
          {legend.map((item) => (
            <li key={item.label} className="flex items-center justify-between gap-3 text-sm">
              <span className="inline-flex items-center gap-2 text-ink/70">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: item.color }}
                  aria-hidden="true"
                />
                {item.label}
              </span>
              <span className="font-semibold tabular-nums text-ink">{formatKg(item.value)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-5 flex items-center gap-3 rounded-2xl bg-success-soft p-3.5">
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/70 text-success"
          aria-hidden="true"
        >
          <TrendingUp className="size-5" />
        </div>
        <p className="min-w-0 flex-1 text-sm text-success">
          Average waste over the last 7 days is{" "}
          <span className="font-semibold tabular-nums">{avgWastePct}%</span>.
        </p>
        <Badge variant={trend.sentiment === "negative" ? "danger" : "success"} size="md">
          {trend.direction === "down" ? <ArrowDownRight className="size-3.5" aria-hidden="true" /> : null}
          {trend.label}
        </Badge>
      </div>
    </Card>
  );
}

// -------------------------------------------------------- recent activity

const ACTIVITY_META: Record<NotificationKind, { icon: LucideIcon; tile: string }> = {
  info: { icon: Info, tile: "bg-info-soft text-info" },
  success: { icon: CheckCircle2, tile: "bg-success-soft text-success" },
  warning: { icon: AlertTriangle, tile: "bg-peach text-accent" },
  danger: { icon: Ban, tile: "bg-danger-soft text-danger" },
};

function RecentActivityCard({ notifications }: { notifications: Notification[] }) {
  const items = notifications.slice(0, 5);

  return (
    <Card as="section" padding="md" aria-label="Recent activity">
      <CardTitle icon={Zap} title="Recent Activity" subtitle="Latest updates from the mess" />

      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink/60">No recent activity.</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((n) => {
            const { icon: Icon, tile } = ACTIVITY_META[n.kind];
            return (
              <li key={n.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <div
                  className={cx(
                    "flex size-10 shrink-0 items-center justify-center rounded-xl",
                    tile,
                  )}
                  aria-hidden="true"
                >
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium text-ink">{n.title}</p>
                    {!n.read ? (
                      <span
                        className="size-2 shrink-0 rounded-full bg-danger"
                        aria-label="Unread"
                      />
                    ) : null}
                  </div>
                  <p className="line-clamp-2 text-sm text-ink/65">{n.body}</p>
                  <p className="mt-0.5 text-xs text-ink/50">{timeAgo(n.createdAt)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// -------------------------------------------------------------------- page

export function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const result = await loadDashboard();
        if (!active) return;
        setData(result);
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : "Could not load the dashboard.");
      }
    })();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const retry = () => {
    setData(null);
    setError(null);
    setReloadKey((k) => k + 1);
  };

  const stats = useMemo(() => {
    if (!data) return null;
    const { overview, forecasts } = data;

    const confirmed = overview.meals.reduce((sum, m) => sum + m.booked, 0);
    const openMeals = overview.meals.filter((m) => !m.closed).length;
    const expected = (overview.totalStudents - overview.onLeave) * openMeals;
    const optInRate = expected > 0 ? Math.round((confirmed / expected) * 100) : 0;

    const tomorrow = [...forecasts.lunch.map((p) => p.date)]
      .filter((d) => d > overview.date)
      .sort()[0];
    const forecastTomorrow = tomorrow ? predictedOn(forecasts, tomorrow) : 0;
    const forecastToday = predictedOn(forecasts, overview.date);
    const forecastTrend =
      forecastToday > 0 ? toTrend(((forecastTomorrow - forecastToday) / forecastToday) * 100) : undefined;

    return { confirmed, expected, optInRate, forecastTomorrow, forecastTrend };
  }, [data]);

  if (error) {
    return (
      <Card padding="lg" className="mx-auto max-w-lg text-center" role="alert">
        <h1 className="font-serif text-2xl font-semibold text-ink">Something went wrong</h1>
        <p className="mt-2 text-ink/65">{error}</p>
        <Button className="mt-5" leftIcon={<RefreshCw className="size-4" aria-hidden="true" />} onClick={retry}>
          Try again
        </Button>
      </Card>
    );
  }

  if (!data || !stats) return <DashboardSkeleton />;

  const { overview, forecasts, waste, meals, notifications } = data;

  return (
    <div className="space-y-6">
      <GradientHero
        title={
          <>
            <span className="mb-1 block font-sans text-xl font-normal [text-shadow:none] sm:text-2xl">
              {greetingFor(new Date().getHours())},
            </span>
            Kitchen Team
          </>
        }
        subtitle="Here's what's happening with Kamar-Taj Refectory today."
        aside={
          <div className="flex flex-col gap-4 lg:items-end lg:text-right">
            <div className="inline-flex items-center gap-2 self-start rounded-xl bg-white/90 px-3.5 py-2 text-sm font-medium text-ink shadow-soft lg:self-end">
              <CalendarDays className="size-4 text-accent" aria-hidden="true" />
              {formatLongDate(overview.date)}
            </div>
            <p className="font-serif text-xl italic text-white/95 sm:text-2xl">
              “Good Food,
              <br />
              Brighter Minds”
            </p>
          </div>
        }
      />

      <section aria-label="Key numbers" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Confirmed Meals"
          icon={Users}
          tone="peach"
          value={stats.confirmed.toLocaleString("en-IN")}
          trend={toTrend(overview.bookedTrendPct)}
          subtitle={`out of ${stats.expected.toLocaleString("en-IN")} expected`}
        />
        <StatCard
          label="Opt-in Rate"
          icon={CheckCircle2}
          tone="green"
          value={`${stats.optInRate}%`}
          subtitle="of students not on leave"
        />
        <CutoffStat meals={overview.meals} />
        <StatCard
          label="Forecast Demand"
          icon={BarChart3}
          tone="blue"
          value={`~${stats.forecastTomorrow.toLocaleString("en-IN")}`}
          trend={stats.forecastTrend}
          subtitle="Estimate for tomorrow"
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <DemandTrendCard forecasts={forecasts} today={overview.date} />
        <TodaysMenuCard meals={meals} stats={overview.meals} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <WasteReductionCard
          waste={waste}
          avgWastePct={overview.avgWastePct}
          wasteTrendPct={overview.wasteTrendPct}
        />
        <RecentActivityCard notifications={notifications} />
      </div>
    </div>
  );
}

export default AdminDashboard;