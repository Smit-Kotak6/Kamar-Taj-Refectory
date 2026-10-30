/**
 * Meal timings: default schedule + date-specific overrides (spec section 8).
 *  - cutoff        = deadline to cancel / take leave
 *  - service start/end = when the meal is served and the QR works
 * All times are wall-clock times in the INSTITUTE timezone, converted on the SERVER.
 * Missing or invalid timing => returns null => the operation is BLOCKED (never guessed).
 */
import type { MealType } from "../generated/prisma/client.js";
import { prisma } from "./db.js";

export const TZ = process.env.INSTITUTE_TZ ?? "Asia/Kolkata";
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const MEALS = ["BREAKFAST", "LUNCH", "DINNER"] as const;

// ---- timezone helpers (no extra library) ----
function tzOffsetMs(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUTC - Math.floor(at.getTime() / 1000) * 1000;
}

/** "2026-10-25" + "12:30" in institute timezone -> exact UTC instant */
function zonedToUtc(day: string, hhmm: string, tz: string): Date {
  const [y, mo, d] = day.split("-").map(Number);
  const [h, m] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, m);
  return new Date(guess - tzOffsetMs(tz, new Date(guess)));
}

export const todayInTz = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

// ---- core lookup ----
export async function resolveMealTimes(mealType: MealType, mealDate: Date) {
  const [base, ov] = await Promise.all([
    prisma.mealSchedule.findUnique({ where: { mealType } }),
    prisma.mealOverride.findUnique({ where: { date_mealType: { date: mealDate, mealType } } }),
  ]);
  if (!base) return null; // no default schedule configured

  // An override changes ONLY this meal on ONLY this date; missing fields fall back to the default
  const cutoffTime = ov?.cutoffTime ?? base.cutoffTime;
  const serviceStart = ov?.serviceStart ?? base.serviceStart;
  const serviceEnd = ov?.serviceEnd ?? base.serviceEnd;
  if (![cutoffTime, serviceStart, serviceEnd].every((t) => HHMM.test(t))) return null;

  const day = mealDate.toISOString().slice(0, 10);
  const cutoff = zonedToUtc(day, cutoffTime, TZ);
  const start = zonedToUtc(day, serviceStart, TZ);
  const end = zonedToUtc(day, serviceEnd, TZ);
  if (start >= end) return null; // invalid window
  return { cutoff, start, end };
}

/** Plug-in for qrRedemption: register with setServiceWindowProvider(serviceWindow) */
export const serviceWindow = async (mealType: MealType, mealDate: Date) => {
  const t = await resolveMealTimes(mealType, mealDate);
  return t ? { start: t.start, end: t.end } : null;
};

