// Pure helpers for the student dashboard. No React, no fetching.
import type { BillingItem, Meal, MealType, WasteStat } from "../api";

export const MEAL_LABEL: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

/** DEMO ONLY: no API field exists for "food saved", so each skipped meal counts as this many kg. */
export const DEMO_KG_PER_SKIPPED_MEAL = 0.4;

/** Local calendar day as 'YYYY-MM-DD'. */
export function todayISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatLongDate(date: Date = new Date()): string {
  return date.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export function isCutoffPassed(meal: Meal, now: number): boolean {
  return new Date(meal.cutoffAt).getTime() <= now;
}

export function countConfirmed(meals: Meal[]): number {
  return meals.filter(
    (m) => m.status === "BOOKED" || m.status === "LOCKED" || m.status === "REDEEMED",
  ).length;
}

/** Earliest cutoff that is still in the future, ignoring closed meals. */
export function nextCutoffMeal(meals: Meal[], now: number): Meal | null {
  const upcoming = meals
    .filter((m) => !m.closed && new Date(m.cutoffAt).getTime() > now)
    .sort((a, b) => new Date(a.cutoffAt).getTime() - new Date(b.cutoffAt).getTime());
  return upcoming[0] ?? null;
}

/** Tab to open first: the next cutoff's meal, else the first meal still being served, else dinner. */
export function defaultTab(meals: Meal[], now: number): MealType {
  const next = nextCutoffMeal(meals, now);
  if (next) return next.type;
  const serving = meals.find((m) => new Date(m.serviceEnd).getTime() > now);
  return serving?.type ?? "dinner";
}

export interface MealActionState {
  canOptIn: boolean;
  canCancel: boolean;
  optInHint?: string;
  cancelHint?: string;
}

export function getMealActions(meal: Meal, now: number): MealActionState {
  const passed = isCutoffPassed(meal, now);
  const canOptIn = !passed && meal.status === "CANCELLED_BY_STUDENT";
  const canCancel = !passed && meal.status === "BOOKED";

  const blocked = (can: boolean, fallback: string): string | undefined => {
    if (can) return undefined;
    if (passed) return "Cutoff passed";
    if (meal.status === "ON_LEAVE") return "You are on leave";
    return fallback;
  };

  return {
    canOptIn,
    canCancel,
    optInHint: blocked(canOptIn, "Already opted in"),
    cancelHint: blocked(canCancel, "Not booked"),
  };
}

// ----------------------------------------------------------- meal visuals

const GRADIENTS: Record<MealType, string> = {
  breakfast: "from-[#FFE2B8] to-[#FFB38A]",
  lunch: "from-[#FFD0B0] to-[#F7A6B8]",
  dinner: "from-[#E2D4FB] to-[#F5B5C8]",
};

const EMOJI_BY_KEYWORD: Array<[string, string]> = [
  ["paratha", "🫓"],
  ["roti", "🫓"],
  ["salad", "🥗"],
  ["poha", "🍛"],
  ["paneer", "🍛"],
  ["idli", "🍚"],
  ["upma", "🍚"],
  ["rice", "🍚"],
  ["dal", "🍲"],
  ["veg", "🥘"],
];

export function mealVisual(meal: Meal): { emoji: string; gradient: string } {
  const title = meal.title.toLowerCase();
  const hit = EMOJI_BY_KEYWORD.find(([kw]) => title.includes(kw));
  return { emoji: hit?.[1] ?? "🍽️", gradient: GRADIENTS[meal.type] };
}

// ----------------------------------------------------------------- impact

/** Consecutive days (ending today, or yesterday if nothing eaten yet today) with a REDEEMED meal. */
export function calcStreak(items: BillingItem[], today: string): number {
  const eaten = new Set(items.filter((i) => i.status === "REDEEMED").map((i) => i.date));
  const cursor = new Date(`${today}T00:00:00`);
  if (!eaten.has(todayISO(cursor))) cursor.setDate(cursor.getDate() - 1);

  let streak = 0;
  while (eaten.has(todayISO(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export interface ImpactSummary {
  mealsServed: number;
  mealsSaved: number;
  foodSavedKg: number;
  avgWastePct: number;
}

export function summariseImpact(items: BillingItem[], waste: WasteStat[]): ImpactSummary {
  const mealsServed = items.filter((i) => i.status === "REDEEMED").length;
  const mealsSaved = items.filter(
    (i) => i.status === "CANCELLED_BY_STUDENT" || i.status === "ON_LEAVE",
  ).length;
  const avg = waste.length ? waste.reduce((sum, w) => sum + w.wastePct, 0) / waste.length : 0;

  return {
    mealsServed,
    mealsSaved,
    foodSavedKg: Math.round(mealsSaved * DEMO_KG_PER_SKIPPED_MEAL * 10) / 10,
    avgWastePct: Math.round(avg * 10) / 10,
  };
}