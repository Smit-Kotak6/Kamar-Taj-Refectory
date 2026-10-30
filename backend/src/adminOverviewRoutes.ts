import { Router } from "express";
import type { MealType } from "../generated/prisma/client.js";
import { authenticate, requireRole } from "./auth.js";
import { prisma } from "./db.js";
import { resolveMealTimes, todayInTz } from "./mealSchedule.js";

export const adminOverviewRouter = Router();
adminOverviewRouter.use(authenticate, requireRole("ADMIN", "SUPER_ADMIN"));
const mealTypes = ["BREAKFAST", "LUNCH", "DINNER"] as const;
const validDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;

adminOverviewRouter.get("/overview", async (req, res) => {
  const day = req.query.date ?? todayInTz();
  if (!validDate(day)) { res.status(400).json({ message: "Use a valid date (YYYY-MM-DD)." }); return; }
  const date = new Date(`${day}T00:00:00.000Z`);
  const [members, bookings, closures, windows] = await Promise.all([
    prisma.membership.count({ where: { startDate: { lte: date }, OR: [{ endDate: null }, { endDate: { gte: date } }], user: { role: "STUDENT" } } }),
    prisma.booking.findMany({ where: { mealDate: date }, select: { mealType: true, status: true } }),
    prisma.closure.findMany({ where: { date }, select: { mealType: true } }),
    Promise.all(mealTypes.map(type => resolveMealTimes(type, date))),
  ]);
  const meals = mealTypes.map((type: MealType, index) => {
    const rows = bookings.filter(b => b.mealType === type);
    const closed = closures.some(c => c.mealType === null || c.mealType === type);
    const times = windows[index];
    return {
      mealType: type.toLowerCase(), closed,
      booked: rows.filter(b => b.status === "BOOKED" || b.status === "REDEEMED").length,
      redeemed: rows.filter(b => b.status === "REDEEMED").length,
      cancelled: rows.filter(b => b.status === "CANCELLED_USER" || b.status === "CANCELLED_LEAVE" || b.status === "CANCELLED_CLOSED").length,
      serviceStart: times?.start.toISOString() ?? null,
      serviceEnd: times?.end.toISOString() ?? null,
      cutoffAt: times?.cutoff.toISOString() ?? null,
    };
  });
  res.json({ date: day, activeMembers: members, meals, totals: {
    booked: meals.reduce((n, m) => n + m.booked, 0),
    redeemed: meals.reduce((n, m) => n + m.redeemed, 0),
    cancelled: meals.reduce((n, m) => n + m.cancelled, 0),
  } });
});

adminOverviewRouter.get("/reports", async (req, res) => {
  const month = req.query.month ?? todayInTz().slice(0, 7);
  if (typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    res.status(400).json({ code: "BAD_REQUEST", message: "Use a valid month (YYYY-MM)." });
    return;
  }
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const end = new Date(Date.UTC(year, monthNumber, 1));
  if (start.toISOString().slice(0, 7) !== month) {
    res.status(400).json({ code: "BAD_REQUEST", message: "Use a valid month (YYYY-MM)." });
    return;
  }
  const groups = await prisma.booking.groupBy({
    by: ["mealDate", "mealType", "status"],
    where: { mealDate: { gte: start, lt: end } },
    _count: { _all: true },
  });
  const days = Array.from({ length: Math.round((end.getTime() - start.getTime()) / 86400000) }, (_, index) => {
    const date = new Date(start.getTime() + index * 86400000).toISOString().slice(0, 10);
    const rows = groups.filter(group => group.mealDate.toISOString().slice(0, 10) === date);
    const count = (statuses: string[]) => rows.filter(row => statuses.includes(row.status)).reduce((total, row) => total + row._count._all, 0);
    return {
      date,
      booked: count(["BOOKED", "REDEEMED"]),
      redeemed: count(["REDEEMED"]),
      cancelled: count(["CANCELLED_USER", "CANCELLED_LEAVE", "CANCELLED_CLOSED"]),
    };
  });
  const totals = days.reduce((sum, day) => ({
    booked: sum.booked + day.booked,
    redeemed: sum.redeemed + day.redeemed,
    cancelled: sum.cancelled + day.cancelled,
  }), { booked: 0, redeemed: 0, cancelled: 0 });
  const meals = mealTypes.map(type => {
    const rows = groups.filter(group => group.mealType === type);
    const count = (statuses: string[]) => rows.filter(row => statuses.includes(row.status)).reduce((total, row) => total + row._count._all, 0);
    return { mealType: type.toLowerCase(), booked: count(["BOOKED", "REDEEMED"]), redeemed: count(["REDEEMED"]), cancelled: count(["CANCELLED_USER", "CANCELLED_LEAVE", "CANCELLED_CLOSED"]) };
  });
  res.json({ month, totals, meals, days });
});

adminOverviewRouter.get("/demand", async (_req, res) => {
  const today = todayInTz();
  const start = new Date(`${today}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 7 * 86400000);
  const [groups, closures] = await Promise.all([
    prisma.booking.groupBy({
      by: ["mealDate", "mealType"],
      where: { mealDate: { gte: start, lt: end }, status: { in: ["BOOKED", "REDEEMED"] } },
      _count: { _all: true },
    }),
    prisma.closure.findMany({ where: { date: { gte: start, lt: end } }, select: { date: true, mealType: true } }),
  ]);
  const days = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(start.getTime() + offset * 86400000).toISOString().slice(0, 10);
    return {
      date,
      meals: mealTypes.map(type => ({
        mealType: type.toLowerCase(),
        booked: groups.find(group => group.mealDate.toISOString().slice(0, 10) === date && group.mealType === type)?._count._all ?? 0,
        closed: closures.some(row => row.date.toISOString().slice(0, 10) === date && (row.mealType === null || row.mealType === type)),
      })),
    };
  });
  res.json({ startDate: today, days });
});
