// src/api/index.ts
// The ONLY file components should import data functions from.
// Right now every function calls the in-memory mock after a small fake delay.
// To go live, replace each body with a fetch() call that returns the same type, e.g.
//
//   export async function getMeals(date: string): Promise<Meal[]> {
//     const res = await fetch(`/api/meals?date=${date}`);
//     if (!res.ok) throw new ApiError('BAD_REQUEST', await res.text());
//     return res.json();
//   }

import * as db from './mock';
import * as paymentsDb from './payments';
import type {
  AdminOverview,
  BillingItem,
  CreateLeaveInput,
  ForecastPoint,
  LeaveRequest,
  Meal,
  MealType,
  Notification,
  Preferences,
  QrToken,
  RebateEntry,
  RedeemResult,
  Timing,
  TimingOverride,
  WasteStat,
} from './types';

export * from './types';
export type { Payment, PaymentMethod } from './payments';

/** A date on which one or more meals are closed (used by the admin Closures page). */
export interface Closure {
  /** 'YYYY-MM-DD' */
  date: string;
  /** The closed meals on that date, in breakfast, lunch, dinner order. */
  mealTypes: MealType[];
  /** true when all three meals are closed. */
  entireMess: boolean;
}

const FAKE_DELAY_MS = 250;

function delay(ms: number = FAKE_DELAY_MS): Promise<void> {
  const jitter = Math.random() * 120;
  return new Promise((resolve) => setTimeout(resolve, ms + jitter));
}

// ----------------------------------------------------------------- meals

export async function getMeals(date: string): Promise<Meal[]> {
  await delay();
  return db.getMeals(date);
}

export async function setMealBooking(mealId: string, booked: boolean): Promise<Meal> {
  await delay();
  return db.setMealBooking(mealId, booked);
}

// ----------------------------------------------------------------- leave

export async function createLeave(input: CreateLeaveInput): Promise<LeaveRequest> {
  await delay();
  return db.createLeave(input);
}

export async function getLeaves(): Promise<LeaveRequest[]> {
  await delay();
  return db.getLeaves();
}

export async function cancelLeave(leaveId: string): Promise<LeaveRequest> {
  await delay();
  return db.cancelLeave(leaveId);
}

// -------------------------------------------------------------------- QR

/** A new token on every call; each one expires 30 seconds after it is issued. */
export async function getQrToken(mealId: string): Promise<QrToken> {
  await delay(120);
  return db.getQrToken(mealId);
}

/** Accepts the full scanned token, or the short manual code. */
export async function redeem(tokenOrCode: string): Promise<RedeemResult> {
  await delay(150);
  return db.redeem(tokenOrCode);
}

// -------------------------------------------------------- billing & rebates

/** month = 'YYYY-MM'; defaults to the current month. */
export async function getBilling(month?: string): Promise<BillingItem[]> {
  await delay();
  return db.getBilling(month);
}

/** Every entry is labelled "Demo policy" until the real rebate rules exist. */
export async function getRebates(): Promise<RebateEntry[]> {
  await delay();
  return db.getRebates();
}

/** Payments the student made in a month. month = 'YYYY-MM'; defaults to the current month. */
export async function getPayments(month?: string): Promise<paymentsDb.Payment[]> {
  await delay();
  const now = new Date();
  const key =
    month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return paymentsDb.getPayments(key);
}

// ------------------------------------------------ preferences & notifications

export async function getPreferences(): Promise<Preferences> {
  await delay();
  return db.getPreferences();
}

export async function savePreferences(preferences: Preferences): Promise<Preferences> {
  await delay();
  return db.savePreferences(preferences);
}

export async function getNotifications(): Promise<Notification[]> {
  await delay();
  return db.getNotifications();
}

// ------------------------------------------------------- admin analytics

export async function getForecast(mealType: MealType = 'lunch'): Promise<ForecastPoint[]> {
  await delay();
  return db.getForecast(mealType);
}

export async function getWasteStats(days: number = 7): Promise<WasteStat[]> {
  await delay();
  return db.getWasteStats(days);
}

export async function getAdminOverview(): Promise<AdminOverview> {
  await delay();
  return db.getAdminOverview();
}

// ------------------------------------------------- timings & closures

/** Effective timings for a date (defaults to today). */
export async function getTimings(date?: string): Promise<Timing[]> {
  await delay();
  return db.getTimings(date);
}

/**
 * The default timings that apply to every day, ignoring any date-specific override.
 * (Mock: a past date can never have an override, so it returns the defaults.
 * A real backend should expose a dedicated endpoint.)
 */
export async function getDefaultTimings(): Promise<Timing[]> {
  await delay();
  return db.getTimings('1970-01-01');
}

/** With `date`: override that day only. Without: change the default for every day. */
export async function saveTimingOverride(override: TimingOverride): Promise<Timing[]> {
  await delay();
  return db.saveTimingOverride(override);
}

/** Returns all three meals of that date, updated. */
export async function closeMeal(date: string, mealType: MealType | 'all'): Promise<Meal[]> {
  await delay();
  return db.closeMeal(date, mealType);
}

/** Extra: undo a closure. Returns all three meals of that date, updated. */
export async function reopenMeal(date: string, mealType: MealType | 'all'): Promise<Meal[]> {
  await delay();
  return db.reopenMeal(date, mealType);
}

/**
 * Closures that have not finished yet, soonest first, looking `days` days ahead
 * (today included). Meals whose service window has already ended are left out.
 */
export async function getUpcomingClosures(days: number = 30): Promise<Closure[]> {
  await delay();
  const now = Date.now();
  const start = new Date();
  const closures: Closure[] = [];

  for (let offset = 0; offset < days; offset++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const closed = db
      .getMeals(date)
      .filter((meal) => meal.closed && new Date(meal.serviceEnd).getTime() > now);
    if (closed.length > 0) {
      closures.push({
        date,
        mealTypes: closed.map((meal) => meal.type),
        entireMess: closed.length === 3,
      });
    }
  }
  return closures;
}

// ------------------------------------------------------------- student

/** The signed-in student. The mock returns a fixed demo student. */
export async function getStudentProfile(): Promise<{ id: string; name: string }> {
  await delay(80);
  return { ...db.STUDENT };
}