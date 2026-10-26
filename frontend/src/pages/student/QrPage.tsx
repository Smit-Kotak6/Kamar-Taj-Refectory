import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import {
  AlertCircle,
  Ban,
  CalendarDays,
  CalendarX2,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Hash,
  Lock,
  RefreshCw,
  ShieldCheck,
  User,
  UtensilsCrossed,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  ApiError,
  MEAL_TYPES,
  MESS_CLOSED_LABEL,
  getMeals,
  getQrToken,
  getStudentProfile,
} from "../../api";
import type { Meal, MealType, QrToken } from "../../api";
import { useCountdown } from "../../hooks/useCountdown";
import { cx } from "../../lib/cx";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { StatusBadge } from "../../components/ui/StatusBadge";

/* ------------------------------------------------------------------ */
/* Constants & small display helpers                                   */
/* ------------------------------------------------------------------ */

const QR_SECONDS = 30;
const FADE_MS = 300;
const POLL_MS = 4000;

const RING_RADIUS = 46;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

type PassView =
  | "loading"
  | "error"
  | "valid"
  | "redeemed"
  | "expired"
  | "closed"
  | "unavailable";

function todayStr(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function formatDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "K7M2QX" -> "K7M 2QX" (display only; the raw code is what gets copied). */
function formatCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}

/** Which meal tab to open first: the first meal that has not finished serving. */
function pickDefaultMeal(meals: Meal[]): MealType {
  const now = Date.now();
  const upcoming = meals.find((m) => now < Date.parse(m.serviceEnd));
  return (upcoming ?? meals[meals.length - 1]).type;
}

function viewFor(meal: Meal | undefined): PassView {
  if (!meal) return "loading";
  if (meal.closed || meal.status === "CANCELLED_MESS_CLOSED") return "closed";
  switch (meal.status) {
    case "REDEEMED":
      return "redeemed";
    case "EXPIRED_UNCONSUMED":
      return "expired";
    case "BOOKED":
    case "LOCKED":
      return "valid";
    default:
      // CANCELLED_BY_STUDENT, ON_LEAVE
      return "unavailable";
  }
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function QrPage() {
  const date = useRef(todayStr()).current;

  const [student, setStudent] = useState<{ id: string; name: string } | null>(null);
  const [meals, setMeals] = useState<Meal[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MealType | null>(null);

  const [token, setToken] = useState<QrToken | null>(null);
  const [tokenVisible, setTokenVisible] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const requestId = useRef(0);

  /* ---------------------------------------------------- data loading */

  const loadMeals = useCallback(
    async (silent = false) => {
      try {
        const list = await getMeals(date);
        setMeals(list);
        setLoadError(null);
      } catch (err) {
        if (!silent) {
          setLoadError(err instanceof Error ? err.message : "Could not load your meals.");
        }
      }
    },
    [date],
  );

  useEffect(() => {
    void loadMeals();
    getStudentProfile()
      .then(setStudent)
      .catch(() => setStudent(null));
  }, [loadMeals]);

  useEffect(() => {
    if (meals && meals.length > 0 && selected === null) {
      setSelected(pickDefaultMeal(meals));
    }
  }, [meals, selected]);

  const meal = meals?.find((m) => m.type === selected);
  const view: PassView = loadError && !meals ? "error" : !meals ? "loading" : viewFor(meal);
  const mealId = meal?.id;
  const canIssue = view === "valid";

  /* ------------------------------------------------- token fetching */

  const fetchToken = useCallback(
    async (id: string, withFade: boolean) => {
      const myRequest = ++requestId.current;
      if (withFade) setTokenVisible(false);
      try {
        const [next] = await Promise.all([
          getQrToken(id),
          withFade ? sleep(FADE_MS) : Promise.resolve(),
        ]);
        if (myRequest !== requestId.current) return;
        setToken(next);
        setTokenError(null);
        setTokenVisible(true);
      } catch (err) {
        if (myRequest !== requestId.current) return;
        setToken(null);
        setTokenVisible(true);
        if (err instanceof ApiError && (err.code === "MESS_CLOSED" || err.code === "NOT_ELIGIBLE")) {
          // The booking changed under us (closed, redeemed...). Re-read the meals.
          void loadMeals(true);
        }
        setTokenError(err instanceof Error ? err.message : "Could not load your code.");
      }
    },
    [loadMeals],
  );

  // First token for a meal (and reset when the tab or state changes).
  useEffect(() => {
    if (!mealId || !canIssue) {
      requestId.current++;
      setToken(null);
      setTokenError(null);
      return;
    }
    setToken(null);
    setTokenError(null);
    setTokenVisible(true);
    void fetchToken(mealId, false);
    return () => {
      requestId.current++;
    };
  }, [mealId, canIssue, fetchToken]);

  // Countdown ring + automatic refresh when it reaches zero.
  const { totalSeconds, isExpired } = useCountdown(token?.expiresAt);

  useEffect(() => {
    if (token && isExpired && mealId && canIssue) {
      void fetchToken(mealId, true);
    }
  }, [token, isExpired, mealId, canIssue, fetchToken]);

  // While a code is on screen, watch for staff scanning it ("Checked in").
  useEffect(() => {
    if (view !== "valid") return;
    const id = window.setInterval(() => void loadMeals(true), POLL_MS);
    return () => window.clearInterval(id);
  }, [view, loadMeals]);

  /* ------------------------------------------------------------ copy */

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  useEffect(() => {
    setCopied(false);
  }, [token?.token]);

  const handleCopy = async () => {
    if (!token?.code) return;
    setCopied(await copyText(token.code));
  };

  const retry = () => {
    if (view === "error") {
      setLoadError(null);
      void loadMeals();
    } else if (mealId) {
      setToken(null);
      setTokenError(null);
      void fetchToken(mealId, false);
    }
  };

  /* ---------------------------------------------------------- render */

  const progress = Math.min(1, Math.max(0, totalSeconds / QR_SECONDS));
  const ringOffset = RING_CIRCUMFERENCE * (1 - progress);
  const showRefreshing = !token || !tokenVisible || isExpired;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <SectionHeader
        as="h1"
        eyebrow="Meal Pass"
        title="Your meal QR"
        description="Show this code at the counter. Staff will scan it to check you in."
      />

      {/* Meal selector */}
      <div
        role="tablist"
        aria-label="Choose a meal"
        className="mx-auto grid max-w-md grid-cols-3 gap-1 rounded-2xl border border-line bg-card p-1 shadow-soft"
      >
        {MEAL_TYPES.map((type) => {
          const active = type === selected;
          return (
            <button
              key={type}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSelected(type)}
              className={cx(
                "h-11 rounded-xl text-sm font-medium transition-colors sm:text-base",
                active ? "bg-ink text-white" : "text-ink/70 hover:bg-peach/60 hover:text-ink",
              )}
            >
              {MEAL_LABELS[type]}
            </button>
          );
        })}
      </div>

      {/* QR card with gradient border */}
      <div className="mx-auto w-full max-w-md rounded-[2rem] bg-brand-gradient p-[3px] shadow-soft">
        <div className="rounded-[calc(2rem-3px)] bg-white p-5 sm:p-7">
          <div className="relative mx-auto aspect-square w-full max-w-[20rem]">
            {view === "valid" ? (
              <>
                {/* Countdown ring */}
                <svg
                  viewBox="0 0 100 100"
                  className="absolute inset-0 size-full -rotate-90"
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id="qr-ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#FF9A5A" />
                      <stop offset="50%" stopColor="#F2597A" />
                      <stop offset="100%" stopColor="#7B5CE6" />
                    </linearGradient>
                  </defs>
                  <circle
                    cx="50"
                    cy="50"
                    r={RING_RADIUS}
                    fill="none"
                    stroke="#F1E4D8"
                    strokeWidth="2.5"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r={RING_RADIUS}
                    fill="none"
                    stroke="url(#qr-ring-gradient)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeDasharray={RING_CIRCUMFERENCE}
                    strokeDashoffset={token ? ringOffset : RING_CIRCUMFERENCE}
                    className="transition-[stroke-dashoffset] duration-1000 ease-linear motion-reduce:transition-none"
                  />
                </svg>

                {/* QR (fades out and back in on every refresh) */}
                <div
                  className={cx(
                    "absolute inset-[11%] flex items-center justify-center transition-opacity duration-300",
                    tokenVisible ? "opacity-100" : "opacity-0",
                  )}
                >
                  {token ? (
                    <QRCodeSVG
                      value={token.token}
                      size={232}
                      level="M"
                      marginSize={0}
                      fgColor="#16212F"
                      bgColor="#FFFFFF"
                      className="h-auto w-full"
                      title={`QR code for ${meal ? MEAL_LABELS[meal.type] : "meal"}`}
                    />
                  ) : tokenError ? (
                    <div className="flex flex-col items-center gap-3 text-center">
                      <AlertCircle className="size-10 text-danger" aria-hidden="true" />
                      <p className="text-sm text-ink/70">{tokenError}</p>
                      <Button size="sm" variant="secondary" onClick={retry}>
                        Try again
                      </Button>
                    </div>
                  ) : (
                    <div
                      className="flex size-full animate-pulse items-center justify-center rounded-2xl bg-cream"
                      aria-label="Loading your QR code"
                    >
                      <RefreshCw className="size-8 animate-spin text-accent" aria-hidden="true" />
                    </div>
                  )}
                </div>
              </>
            ) : (
              <StatePanel view={view} meal={meal} loadError={loadError} onRetry={retry} />
            )}
          </div>

          {view === "valid" ? (
            <div className="mt-4 flex justify-center">
              <Badge
                variant={showRefreshing || totalSeconds > 10 ? "info" : "warning"}
                size="md"
                icon={showRefreshing ? RefreshCw : Clock}
                role="timer"
              >
                {showRefreshing ? "Refreshing…" : `New code in ${totalSeconds}s`}
              </Badge>
            </div>
          ) : null}
        </div>
      </div>

      {/* Details */}
      <Card padding="lg" className="mx-auto w-full max-w-md">
        <dl className="divide-y divide-line">
          <DetailRow icon={User} label="Student">
            {student ? (
              <>
                {student.name} <span className="text-ink/55">· {student.id}</span>
              </>
            ) : (
              <span className="text-ink/40">—</span>
            )}
          </DetailRow>

          <DetailRow icon={UtensilsCrossed} label="Meal">
            {meal ? (
              <span className="flex flex-wrap items-center gap-2">
                <span>
                  {MEAL_LABELS[meal.type]} · {meal.title}
                </span>
                <StatusBadge status={meal.status} />
              </span>
            ) : (
              <span className="text-ink/40">—</span>
            )}
          </DetailRow>

          <DetailRow icon={CalendarDays} label="Date">
            {meal ? formatDate(meal.date) : <span className="text-ink/40">—</span>}
          </DetailRow>

          <DetailRow icon={Hash} label="Manual booking code">
            <span className="flex items-center justify-between gap-3">
              <span
                className={cx(
                  "font-mono text-xl font-semibold tracking-[0.25em] tabular-nums",
                  token?.code && tokenVisible ? "text-ink" : "text-ink/30",
                )}
                aria-live="off"
              >
                {token?.code ? formatCode(token.code) : "— — —"}
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={!token?.code}
                onClick={handleCopy}
                leftIcon={
                  copied ? (
                    <Check className="size-4 text-success" aria-hidden="true" />
                  ) : (
                    <Copy className="size-4" aria-hidden="true" />
                  )
                }
                aria-label="Copy manual code"
              >
                {copied ? "Copied" : "Copy"}
              </Button>
            </span>
            <span className="sr-only" role="status">
              {copied ? "Code copied to clipboard" : ""}
            </span>
          </DetailRow>
        </dl>
      </Card>

      <p className="mx-auto flex max-w-md items-center justify-center gap-2 text-center text-sm text-ink/60">
        <ShieldCheck className="size-4 shrink-0 text-success" aria-hidden="true" />
        This code refreshes every 30 seconds and works only once.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <div
        className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-peach text-accent"
        aria-hidden="true"
      >
        <Icon className="size-4.5" />
      </div>
      <div className="min-w-0 flex-1">
        <dt className="text-xs uppercase tracking-[0.15em] text-ink/55">{label}</dt>
        <dd className="mt-0.5 text-sm font-medium text-ink sm:text-base">{children}</dd>
      </div>
    </div>
  );
}

interface StatePanelProps {
  view: PassView;
  meal: Meal | undefined;
  loadError: string | null;
  onRetry: () => void;
}

/** Fills the square where the QR would be for every non-valid state. */
function StatePanel({ view, meal, loadError, onRetry }: StatePanelProps) {
  if (view === "loading") {
    return (
      <div
        className="flex size-full animate-pulse items-center justify-center rounded-2xl bg-cream"
        aria-label="Loading"
      >
        <RefreshCw className="size-8 animate-spin text-accent" aria-hidden="true" />
      </div>
    );
  }

  const mealName = meal ? MEAL_LABELS[meal.type].toLowerCase() : "meal";
  const cutoffPassed = meal ? Date.now() >= Date.parse(meal.cutoffAt) : false;

  let tone = "bg-cream text-ink";
  let Icon: LucideIcon = Lock;
  let title = "";
  let body: ReactNode = null;
  let role: "status" | "alert" = "status";

  switch (view) {
    case "redeemed":
      tone = "bg-success-soft text-success";
      Icon = CheckCircle2;
      title = "Checked in";
      body = `Your ${mealName} has been scanned. Enjoy your meal!`;
      break;
    case "closed":
      tone = "bg-danger-soft text-danger";
      Icon = Ban;
      title = MESS_CLOSED_LABEL;
      body = "The mess is closed for this meal. You won't be charged.";
      role = "alert";
      break;
    case "expired":
      tone = "bg-[#F4EEE8] text-ink";
      Icon = Clock;
      title = "Expired";
      body = `Service for this ${mealName} has ended and it was not checked in.`;
      break;
    case "unavailable":
      tone = "bg-peach text-accent";
      Icon = meal?.status === "ON_LEAVE" ? CalendarX2 : Lock;
      title = meal?.status === "ON_LEAVE" ? "You're on leave" : "Not booked";
      body = cutoffPassed
        ? `Booking for this ${mealName} is locked, so no code can be issued.`
        : `Book this ${mealName} from My Meals to get your code.`;
      break;
    case "error":
      tone = "bg-danger-soft text-danger";
      Icon = AlertCircle;
      title = "Something went wrong";
      body = loadError ?? "Could not load your meals.";
      role = "alert";
      break;
    default:
      break;
  }

  return (
    <div
      role={role}
      className={cx(
        "flex size-full flex-col items-center justify-center gap-3 rounded-2xl p-6 text-center",
        tone,
      )}
    >
      <Icon className="size-16 sm:size-20" aria-hidden="true" />
      <h2 className="font-serif text-2xl font-semibold leading-tight sm:text-3xl">{title}</h2>
      <p className="max-w-[16rem] text-sm text-ink/70">{body}</p>

      {view === "unavailable" ? (
        <Link
          to="/student/meals"
          className="mt-1 inline-flex h-10 items-center justify-center rounded-xl bg-ink px-4 text-sm font-medium text-white transition-colors hover:bg-ink/90"
        >
          Go to My Meals
        </Link>
      ) : null}
      {view === "error" ? (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export default QrPage;