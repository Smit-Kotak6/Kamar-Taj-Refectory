import { Router } from "express";
import type { MealType } from "../generated/prisma/client.js";
import { authenticate, requireRole } from "./auth.js";
import { prisma } from "./db.js";
import { todayInTz } from "./mealSchedule.js";

export const adminScheduleRouter = Router();
adminScheduleRouter.use(authenticate, requireRole("ADMIN", "SUPER_ADMIN"));
const meals = ["BREAKFAST", "LUNCH", "DINNER"] as const;
const dateIsValid = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const meal = (v: unknown): MealType | null => typeof v === "string" && meals.includes(v.toUpperCase() as MealType) ? v.toUpperCase() as MealType : null;
const hhmm = (v: unknown): v is string => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

async function timings(day?: string) {
  const [base, overrides] = await Promise.all([
    prisma.mealSchedule.findMany(),
    day ? prisma.mealOverride.findMany({ where: { date: new Date(day) } }) : Promise.resolve([]),
  ]);
  return meals.map(type => {
    const b = base.find(x => x.mealType === type);
    const o = overrides.find(x => x.mealType === type);
    return { mealType: type.toLowerCase(), cutoff: o?.cutoffTime ?? b?.cutoffTime ?? "", serviceStart: o?.serviceStart ?? b?.serviceStart ?? "", serviceEnd: o?.serviceEnd ?? b?.serviceEnd ?? "", overridden: !!o };
  });
}

adminScheduleRouter.get("/timings/defaults", async (_req, res) => { res.json(await timings()); });
adminScheduleRouter.get("/timings", async (req, res) => {
  const day = req.query.date ?? todayInTz();
  if (!dateIsValid(day)) { res.status(400).json({ message: "Use a valid date (YYYY-MM-DD)." }); return; }
  res.json(await timings(day));
});
adminScheduleRouter.put("/timings", async (req, res) => {
  const b = req.body;
  const type = meal(b?.mealType);
  if (!type || !hhmm(b.cutoff) || !hhmm(b.serviceStart) || !hhmm(b.serviceEnd) || b.cutoff >= b.serviceStart || b.serviceStart >= b.serviceEnd || (b.date !== undefined && (!dateIsValid(b.date) || b.date < todayInTz()))) {
    res.status(400).json({ message: "Enter a valid meal, future date, and cutoff < service start < service end." }); return;
  }
  const data = { cutoffTime: b.cutoff as string, serviceStart: b.serviceStart as string, serviceEnd: b.serviceEnd as string };
  if (b.date) {
    const date = new Date(b.date as string);
    await prisma.mealOverride.upsert({ where: { date_mealType: { date, mealType: type } }, create: { date, mealType: type, ...data }, update: data });
  } else {
    await prisma.mealSchedule.upsert({ where: { mealType: type }, create: { mealType: type, ...data }, update: data });
  }
  res.json(await timings(b.date));
});

function scope(value: unknown): MealType | "all" | null { return value === "all" ? "all" : meal(value); }
function validClosure(date: unknown, value: unknown): date is string { return dateIsValid(date) && date >= todayInTz() && scope(value) !== null; }

adminScheduleRouter.post("/closures", async (req, res) => {
  const { date: day, mealType: input } = req.body ?? {};
  if (!validClosure(day, input)) { res.status(400).json({ message: "Choose today or a future date and a meal." }); return; }
  const date = new Date(day);
  const type = scope(input)!;
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${day}))::text`;
    const existing = await tx.closure.findMany({ where: { date } });
    if (type === "all") {
      if (!existing.some(x => x.mealType === null)) await tx.closure.create({ data: { date, mealType: null } });
      await tx.closure.deleteMany({ where: { date, mealType: { not: null } } });
    } else if (!existing.some(x => x.mealType === null || x.mealType === type)) {
      await tx.closure.create({ data: { date, mealType: type } });
    }
    await tx.booking.updateMany({ where: { mealDate: date, ...(type === "all" ? {} : { mealType: type }), status: "BOOKED" }, data: { status: "CANCELLED_CLOSED" } });
  });
  res.json({ ok: true });
});

adminScheduleRouter.delete("/closures", async (req, res) => {
  const day = req.query.date;
  const type = scope(req.query.mealType);
  if (!validClosure(day, req.query.mealType)) { res.status(400).json({ message: "Choose today or a future date and a meal." }); return; }
  const date = new Date(day);
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${day}))::text`;
    if (type === "all") await tx.closure.deleteMany({ where: { date } });
    else await tx.closure.deleteMany({ where: { date, mealType: type } });
    const stillClosed = await tx.closure.findMany({ where: { date } });
    const openTypes = meals.filter(t => !stillClosed.some(c => c.mealType === null || c.mealType === t));
    if (openTypes.length) await tx.booking.updateMany({ where: { mealDate: date, mealType: { in: openTypes }, status: "CANCELLED_CLOSED" }, data: { status: "BOOKED" } });
  });
  res.json({ ok: true });
});

adminScheduleRouter.get("/closures", async (req, res) => {
  const days = Number(req.query.days ?? 30);
  if (!Number.isInteger(days) || days < 1 || days > 365) { res.status(400).json({ message: "Days must be between 1 and 365." }); return; }
  const start = todayInTz();
  const end = new Date(new Date(start).getTime() + days * 86_400_000);
  const rows = await prisma.closure.findMany({ where: { date: { gte: new Date(start), lt: end } }, orderBy: { date: "asc" } });
  const grouped = new Map<string, Set<MealType>>();
  for (const row of rows) {
    const key = row.date.toISOString().slice(0, 10);
    const set = grouped.get(key) ?? new Set<MealType>();
    for (const type of row.mealType ? [row.mealType] : meals) set.add(type);
    grouped.set(key, set);
  }
  res.json([...grouped].map(([date, types]) => ({ date, mealTypes: meals.filter(t => types.has(t)).map(t => t.toLowerCase()), entireMess: types.size === 3 })));
});
