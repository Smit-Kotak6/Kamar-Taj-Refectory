// src/lib/adminUtils.ts
// Small pure helpers shared by the admin pages (Planning, Closures).
// No data fetching here: that always goes through src/api.

import type { MealType } from "../api/types";

// ------------------------------------------------------------ meal labels

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

// ----------------------------------------------------------------- dates

const pad = (n: number) => String(n).padStart(2, "0");

/** Today as 'YYYY-MM-DD' in the local time zone. */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** '2026-10-26' -> 'Mon, 26 Oct 2026'. */
export function formatLongDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** '14:30' -> '2:30 PM'. Returns the input unchanged if it is not 'HH:mm'. */
export function formatTime12(hhmm: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!match) return hhmm;
  const h = Number(match[1]);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${match[2]} ${suffix}`;
}

// ------------------------------------------------------- timing validation

export interface TimeFields {
  /** 'HH:mm', or '' when the admin has left the field empty. */
  cutoff: string;
  serviceStart: string;
  serviceEnd: string;
}

export type TimeFieldKey = keyof TimeFields;

export const TIME_FIELD_LABELS: Record<TimeFieldKey, string> = {
  cutoff: "Cutoff",
  serviceStart: "Service start",
  serviceEnd: "Service end",
};

export const TIME_FIELD_KEYS: TimeFieldKey[] = ["cutoff", "serviceStart", "serviceEnd"];

export type TimeErrors = Partial<Record<TimeFieldKey, string>>;

/**
 * Returns an error message per invalid field (empty object = valid).
 * Empty fields are reported as errors; nothing is ever filled in for the admin.
 */
export function validateTimes(times: TimeFields): TimeErrors {
  const errors: TimeErrors = {};

  for (const key of TIME_FIELD_KEYS) {
    if (!times[key]) errors[key] = `${TIME_FIELD_LABELS[key]} is required.`;
  }
  // Order checks only make sense once every field has a value.
  if (Object.keys(errors).length > 0) return errors;

  if (times.cutoff >= times.serviceStart) {
    errors.cutoff = "Cutoff must be before service start.";
  }
  if (times.serviceStart >= times.serviceEnd) {
    errors.serviceEnd = "Service end must be after service start.";
  }
  return errors;
}

export function hasErrors(errors: object): boolean {
  return Object.keys(errors).length > 0;
}

export function sameTimes(a: TimeFields, b: TimeFields): boolean {
  return TIME_FIELD_KEYS.every((key) => a[key] === b[key]);
}

// ----------------------------------------------------------------- errors

export function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Something went wrong. Please try again.";
}