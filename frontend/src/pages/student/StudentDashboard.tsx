import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CalendarCheck,
  CalendarDays,
  Check,
  Clock,
  Flame,
  Leaf,
  Scale,
  TrendingDown,
  UtensilsCrossed,
} from "lucide-react";
import {
  ApiError,
  MESS_CLOSED_LABEL,
  MEAL_TYPES,
  getBilling,
  getMeals,
  getWasteStats,
  setMealBooking,
} from "../../api";
import type { Meal, MealType } from "../../api";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { GradientHero } from "../../components/ui/GradientHero";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { StatCard } from "../../components/ui/StatCard";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { useCountdown } from "../../hooks/useCountdown";
import { useNow } from "../../hooks/useNow";
import { cx } from "../../lib/cx";
import {
  MEAL_LABEL,
  calcStreak,
  countConfirmed,
  defaultTab,
  formatLongDate,
  formatTime,
  getMealActions,
  mealVisual,
  nextCutoffMeal,
  summariseImpact,
  todayISO,
} from "../../lib/dashboard";
import type { ImpactSummary } from "../../lib/dashboard";

// ------------------------------------------------------------ small pieces

function LiveCountdown({ target, className }: { target: string; className?: string }) {
  const { formatted, isExpired } = useCountdown(target);
  return <span className={className}>{isExpired ? "Closed" : formatted}</span>;
}

function MealCard({
  meal,
  now,
  busy,
  onBook,
}: {
  meal: Meal;
  now: number;
  busy: boolean;
  onBook: (meal: Meal, booked: boolean) => void;
}) {
  const { emoji, gradient } = mealVisual(meal);
  const actions = getMealActions(meal, now);
  const extraTag = meal.tags.find((t) => !/low[\s-]?waste/i.test(t));

  return (
    <Card as="article" padding="none" className="flex flex-col overflow-hidden">
      <div
        className={cx(
          "relative flex h-36 items-center justify-center bg-gradient-to-br",
          gradient,
          meal.closed && "opacity-60 grayscale",
        )}
        aria-hidden="true"
      >
        <span className="text-6xl drop-shadow-sm">{emoji}</span>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="font-serif text-xl font-semibold leading-tight">{meal.title}</h3>
          <p className="mt-0.5 text-sm text-ink/65">{meal.description}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="success" icon={Leaf}>
            Low waste
          </Badge>
          <Badge variant="warning" icon={Flame}>
            {meal.kcal} kcal
          </Badge>
          {extraTag ? <Badge variant="neutral">{extraTag}</Badge> : null}
        </div>

        {!meal.closed ? <StatusBadge status={meal.status} className="self-start" /> : null}

        <div className="mt-auto pt-1">
          {meal.closed ? (
            <div
              role="alert"
              className="rounded-xl bg-danger-soft px-3 py-2.5 text-center text-sm font-semibold tracking-wide text-danger"
            >
              {MESS_CLOSED_LABEL}
            </div>
          ) : (
            <div className="flex gap-2">
              <span className="flex-1" title={actions.optInHint} aria-label={actions.optInHint}>
                <Button
                  size="sm"
                  fullWidth
                  leftIcon={<Check className="size-4" aria-hidden="true" />}
                  disabled={!actions.canOptIn || busy}
                  loading={busy && actions.canOptIn}
                  onClick={() => onBook(meal, true)}
                >
                  Opt In
                </Button>
              </span>
              <span className="flex-1" title={actions.cancelHint} aria-label={actions.cancelHint}>
                <Button
                  size="sm"
                  variant="secondary"
                  fullWidth
                  disabled={!actions.canCancel || busy}
                  loading={busy && actions.canCancel}
                  onClick={() => onBook(meal, false)}
                >
                  Cancel
                </Button>
              </span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function MealSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-72 animate-pulse rounded-2xl border border-line bg-card" />
      ))}
    </div>
  );
}

function ImpactItem({
  icon: Icon,
  value,
  label,
  note,
}: {
  icon: typeof Leaf;
  value: string;
  label: string;
  note: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-peach text-accent">
        <Icon className="size-5" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="font-serif text-2xl font-semibold leading-tight tabular-nums">{value}</p>
        <p className="truncate text-sm text-ink/80">{label}</p>
        <p className="truncate text-xs text-ink/55">{note}</p>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------- page

export function StudentDashboard() {
  const navigate = useNavigate();
  const today = useMemo(() => todayISO(), []);
  const now = useNow();

  const [meals, setMeals] = useState<Meal[]>([]);
  const [impact, setImpact] = useState<ImpactSummary | null>(null);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [tab, setTab] = useState<MealType | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMeals(today), getBilling(), getWasteStats(7)])
      .then(([mealList, billing, waste]) => {
        if (cancelled) return;
        setMeals(mealList);
        setStreak(calcStreak(billing, today));
        setImpact(summariseImpact(billing, waste));
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof ApiError ? e.message : "Could not load your dashboard.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [today]);

  const handleBook = useCallback(async (meal: Meal, booked: boolean) => {
    setPendingId(meal.id);
    setActionError(null);
    try {
      const updated = await setMealBooking(meal.id, booked);
      setMeals((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setPendingId(null);
    }
  }, []);

  const activeTab: MealType = tab ?? defaultTab(meals, now);
  const visibleMeals = meals.filter((m) => m.type === activeTab);
  const confirmed = countConfirmed(meals);
  const next = nextCutoffMeal(meals, now);

  const scrollToMenu = () =>
    document.getElementById("todays-menu")?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 sm:gap-8">
      {/* ------------------------------------------------------------ hero */}
      <GradientHero
        eyebrow="Kamar-Taj Refectory"
        title={
          <>
            Your meals.
            <br />
            Your choice.
            <br />
            Less waste.
          </>
        }
        subtitle="Book your campus meals, manage your preferences and help us reduce food waste together."
        aside={
          <Card className="mx-auto w-full max-w-sm border-white/40 bg-white/85 backdrop-blur lg:ml-auto">
            <Leaf className="size-8 text-success" aria-hidden="true" />
            <p className="mt-3 text-sm text-ink/65">Food saved together</p>
            <p className="font-serif text-4xl font-semibold tabular-nums">
              {impact ? `${impact.foodSavedKg} kg` : "—"}
            </p>
            <p className="mt-1 text-sm text-ink/65">
              {impact ? `${impact.mealsSaved} meals skipped instead of wasted` : "Loading…"}
            </p>
          </Card>
        }
      >
        <Button
          size="lg"
          rightIcon={<ArrowRight className="size-5" aria-hidden="true" />}
          onClick={scrollToMenu}
        >
          Explore today&apos;s menu
        </Button>
        <Button
          size="lg"
          variant="secondary"
          className="border-transparent"
          leftIcon={<CalendarDays className="size-5" aria-hidden="true" />}
          onClick={() => navigate("/student/meals")}
        >
          Manage my meals
        </Button>
      </GradientHero>

      {loadError ? (
        <div role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
          {loadError}
        </div>
      ) : null}

      {/* ------------------------------------------------------- stat row */}
      <section aria-label="Your day at a glance" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Today's meals confirmed"
          icon={UtensilsCrossed}
          tone="lilac"
          value={loading ? "—" : `${confirmed}/${meals.length || MEAL_TYPES.length}`}
          subtitle={
            loading
              ? undefined
              : confirmed === meals.length
                ? "All confirmed"
                : `${meals.length - confirmed} still open`
          }
        />
        <StatCard
          label="Cancellation deadline"
          icon={Clock}
          tone="peach"
          value={next ? <LiveCountdown target={next.cutoffAt} /> : "—"}
          valueClassName="text-accent"
          subtitle={
            next
              ? `${MEAL_LABEL[next.type]} cutoff · ${formatTime(next.cutoffAt)}`
              : loading
                ? undefined
                : "No more cutoffs today"
          }
        />
        <StatCard
          label="Your streak"
          icon={Flame}
          tone="blue"
          value={`${streak} ${streak === 1 ? "day" : "days"}`}
          subtitle={streak > 0 ? "Consistent eater" : "Eat a meal to start one"}
        />
        <StatCard
          label="Food saved together"
          icon={Leaf}
          tone="green"
          value={impact ? `${impact.foodSavedKg} kg` : "—"}
          subtitle="this month"
        />
      </section>

      {/* --------------------------------------------- menu + deadline card */}
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section id="todays-menu" className="min-w-0 scroll-mt-4">
          <SectionHeader
            eyebrow="Today's menu"
            title="Fresh meals for a better tomorrow"
            description={formatLongDate()}
            action={
              <div
                role="tablist"
                aria-label="Meal"
                className="inline-flex rounded-xl border border-line bg-card p-1"
              >
                {MEAL_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === type}
                    onClick={() => setTab(type)}
                    className={cx(
                      "h-9 rounded-lg px-4 text-sm font-medium transition-colors",
                      activeTab === type ? "bg-ink text-white" : "text-ink/70 hover:bg-peach/60",
                    )}
                  >
                    {MEAL_LABEL[type]}
                  </button>
                ))}
              </div>
            }
          />

          {actionError ? (
            <div role="alert" className="mt-4 rounded-xl bg-danger-soft px-4 py-2.5 text-sm font-medium text-danger">
              {actionError}
            </div>
          ) : null}

          <div className="mt-5" role="tabpanel">
            {loading ? (
              <MealSkeleton />
            ) : visibleMeals.length === 0 ? (
              <Card className="text-center text-ink/65">No {MEAL_LABEL[activeTab].toLowerCase()} on the menu today.</Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {visibleMeals.map((meal) => (
                  <MealCard
                    key={meal.id}
                    meal={meal}
                    now={now}
                    busy={pendingId === meal.id}
                    onBook={handleBook}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        <aside className="min-w-0">
          <Card padding="lg" className="lg:sticky lg:top-4">
            <div className="flex items-center gap-2 text-ink/80">
              <Clock className="size-5 text-accent" aria-hidden="true" />
              <h2 className="font-serif text-lg font-semibold">Cancellation Deadline</h2>
            </div>
            {next ? (
              <>
                <p className="mt-4 font-serif text-5xl font-semibold leading-none tabular-nums text-accent">
                  <LiveCountdown target={next.cutoffAt} />
                </p>
                <p className="mt-3 text-sm text-ink/65">
                  {MEAL_LABEL[next.type]} cutoff · {formatTime(next.cutoffAt)}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-5"
                  rightIcon={<ArrowRight className="size-4" aria-hidden="true" />}
                  onClick={() => setTab(next.type)}
                >
                  View {MEAL_LABEL[next.type].toLowerCase()}
                </Button>
              </>
            ) : (
              <p className="mt-4 text-sm text-ink/65">
                {loading ? "Loading…" : "All of today's cutoffs have passed. See you tomorrow!"}
              </p>
            )}

            <div className="mt-6 border-t border-line pt-5">
              <h3 className="flex items-center gap-2 font-serif text-base font-semibold">
                <CalendarCheck className="size-4 text-info" aria-hidden="true" />
                Why it matters
              </h3>
              <ul className="mt-2 space-y-1.5 text-sm text-ink/65">
                <li>Helps us prepare the right quantity</li>
                <li>Reduces unnecessary food waste</li>
                <li>Ensures better quality meals for everyone</li>
              </ul>
            </div>
          </Card>
        </aside>
      </div>

      {/* ----------------------------------------------------- impact strip */}
      <Card as="section" padding="lg" aria-label="Our impact">
        <div className="grid gap-6 lg:grid-cols-[14rem_1fr] lg:items-center">
          <div>
            <h2 className="font-serif text-2xl font-semibold">Our Impact</h2>
            <p className="text-sm text-ink/65">Small choices. A big difference.</p>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <ImpactItem
              icon={UtensilsCrossed}
              value={impact ? String(impact.mealsServed) : "—"}
              label="Meals eaten"
              note="this month"
            />
            <ImpactItem
              icon={Leaf}
              value={impact ? String(impact.mealsSaved) : "—"}
              label="Meals saved"
              note="from being wasted"
            />
            <ImpactItem
              icon={Scale}
              value={impact ? `${impact.foodSavedKg} kg` : "—"}
              label="Food waste reduced"
              note="equivalent"
            />
            <ImpactItem
              icon={TrendingDown}
              value={impact ? `${impact.avgWastePct}%` : "—"}
              label="Campus food waste"
              note="last 7 days"
            />
          </div>
        </div>
      </Card>
    </div>
  );
}