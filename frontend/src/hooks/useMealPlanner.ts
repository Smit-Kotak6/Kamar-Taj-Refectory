import { useCallback, useEffect, useMemo, useState } from "react";
import { getMeals, setMealBooking } from "../api";
import type { BookingStatus, Meal, MealType } from "../api";

// ------------------------------------------------------------ date helpers

export interface DayOption {
  /** 'YYYY-MM-DD' (local calendar day) */
  date: string;
  /** "Thu" */
  weekday: string;
  /** "24 Apr" */
  label: string;
  isToday: boolean;
}

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Today plus the next `count - 1` days. */
export function buildDays(count = 4, from: Date = new Date()): DayOption[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    return {
      date: toDateString(d),
      weekday: d.toLocaleDateString("en-US", { weekday: "short" }),
      label: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      isToday: i === 0,
    };
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** "7:30 AM – 9:30 AM" */
export function formatServiceWindow(meal: Meal): string {
  return `${formatTime(meal.serviceStart)} – ${formatTime(meal.serviceEnd)}`;
}

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

// ------------------------------------------------------- booking semantics

/** Statuses where the student has a booking for the meal (toggle shows "on"). */
const BOOKED_STATUSES: ReadonlySet<BookingStatus> = new Set<BookingStatus>([
  "BOOKED",
  "LOCKED",
  "REDEEMED",
  "EXPIRED_UNCONSUMED",
]);

/** Statuses the student may still flip before the cutoff. */
const EDITABLE_STATUSES: ReadonlySet<BookingStatus> = new Set<BookingStatus>([
  "BOOKED",
  "CANCELLED_BY_STUDENT",
]);

export type MealAvailability = "open" | "closed" | "on_leave" | "locked";

export function getAvailability(meal: Meal): MealAvailability {
  if (meal.closed) return "closed";
  if (meal.status === "ON_LEAVE") return "on_leave";
  if (!EDITABLE_STATUSES.has(meal.status)) return "locked";
  if (Date.now() >= new Date(meal.cutoffAt).getTime()) return "locked";
  return "open";
}

// ------------------------------------------------------------------- hook

type LoadState = "loading" | "ready" | "error";

export interface SaveResult {
  ok: boolean;
  message: string;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

async function fetchDays(days: DayOption[]): Promise<Record<string, Meal[]>> {
  const results = await Promise.all(days.map((d) => getMeals(d.date)));
  return Object.fromEntries(days.map((d, i) => [d.date, results[i]]));
}

export function useMealPlanner(dayCount = 4) {
  const days = useMemo(() => buildDays(dayCount), [dayCount]);
  const [selectedDate, setSelectedDate] = useState<string>(() => days[0].date);
  const [mealsByDate, setMealsByDate] = useState<Record<string, Meal[]>>({});
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  /** mealId -> the booked value the student wants (only where it differs from the server). */
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  // Bumped when a cutoff passes so lock states are recalculated.
  const [, setClock] = useState(0);

  const load = useCallback(
    async (showSpinner: boolean) => {
      if (showSpinner) setLoadState("loading");
      try {
        setMealsByDate(await fetchDays(days));
        setLoadState("ready");
      } catch (error) {
        setErrorMessage(messageOf(error));
        setLoadState("error");
      }
    },
    [days],
  );

  useEffect(() => {
    let cancelled = false;
    fetchDays(days)
      .then((data) => {
        if (cancelled) return;
        setMealsByDate(data);
        setLoadState("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        setErrorMessage(messageOf(error));
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const reload = useCallback(() => load(true), [load]);
  const refreshClock = useCallback(() => setClock((c) => c + 1), []);

  const isBooked = useCallback(
    (meal: Meal): boolean => pending[meal.id] ?? BOOKED_STATUSES.has(meal.status),
    [pending],
  );

  const hasPending = useCallback((meal: Meal): boolean => meal.id in pending, [pending]);

  const setBooked = useCallback((meal: Meal, next: boolean) => {
    setPending((prev) => {
      const next_ = { ...prev };
      if (next === BOOKED_STATUSES.has(meal.status)) delete next_[meal.id];
      else next_[meal.id] = next;
      return next_;
    });
  }, []);

  const meals = mealsByDate[selectedDate] ?? [];
  const changeCount = Object.keys(pending).length;

  // Meals the student is currently confirming: booked, still open, across all days.
  let confirmCount = 0;
  for (const dayMeals of Object.values(mealsByDate)) {
    for (const meal of dayMeals) {
      if (getAvailability(meal) === "open" && isBooked(meal)) confirmCount += 1;
    }
  }

  const save = useCallback(async (): Promise<SaveResult | null> => {
    const entries = Object.entries(pending);
    if (entries.length === 0 || saving) return null;

    setSaving(true);
    const results = await Promise.allSettled(
      entries.map(([mealId, booked]) => setMealBooking(mealId, booked)),
    );
    const failures = results.flatMap((r) => (r.status === "rejected" ? [messageOf(r.reason)] : []));
    const saved = entries.length - failures.length;

    // Re-read from the API so the screen shows the real status of every meal.
    setPending({});
    await load(false);
    setSaving(false);

    if (failures.length === 0) {
      return { ok: true, message: `Meals confirmed. ${plural(saved, "change")} saved.` };
    }
    if (saved === 0) return { ok: false, message: failures[0] };
    return {
      ok: false,
      message: `${plural(saved, "change")} saved, ${failures.length} failed: ${failures[0]}`,
    };
  }, [pending, saving, load]);

  return {
    days,
    selectedDate,
    selectDate: setSelectedDate,
    meals,
    loadState,
    errorMessage,
    reload,
    isBooked,
    hasPending,
    setBooked,
    confirmCount,
    changeCount,
    saving,
    save,
    refreshClock,
  };
}