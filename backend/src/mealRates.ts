import type { MealType } from "../generated/prisma/client.js";
import { prisma } from "./db.js";

export const rateMealTypes = ["BREAKFAST", "LUNCH", "DINNER"] as const;
export const validDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
export const dateValue = (value: string) => new Date(`${value}T00:00:00.000Z`);
export const validAmount = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 1_000_000;
export const parseMealType = (value: unknown): MealType | null => {
  if (typeof value !== "string") return null;
  const type = value.toUpperCase();
  return rateMealTypes.find(item => item === type) ?? null;
};

export async function rateSchedule(start: Date, end: Date) {
  const [versions, overrides] = await Promise.all([
    prisma.mealRateVersion.findMany({ where: { effectiveFrom: { lt: end } }, orderBy: { effectiveFrom: "desc" } }),
    prisma.mealRateOverride.findMany({ where: { date: { gte: start, lt: end } } }),
  ]);
  return (date: Date, mealType: MealType) => {
    const overridden = overrides.find(row => row.mealType === mealType && row.date.getTime() === date.getTime());
    const base = versions.find(row => row.mealType === mealType && row.effectiveFrom <= date);
    if (!base) throw new Error(`Missing default rate for ${mealType}`);
    return { amountPaise: overridden?.amountPaise ?? base.amountPaise, basePaise: base.amountPaise, overridePaise: overridden?.amountPaise ?? null };
  };
}
