import { Router } from "express";
import { randomUUID } from "node:crypto";
import type { MealType } from "../generated/prisma/client.js";
import { prisma } from "./db.js";
import { authenticate, requireRole } from "./auth.js";
import { resolveMealTimes } from "./mealSchedule.js";
import { generateBookingSecrets } from "./qrRedemption.js";

export const mealsRouter = Router();
mealsRouter.use(authenticate, requireRole("STUDENT"));
const types = ["BREAKFAST", "LUNCH", "DINNER"] as const;
const validDate = (s: unknown): s is string => {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const value = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(value.getTime()) && value.toISOString().slice(0, 10) === s;
};
const dateValue = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function membershipFor(studentId: string, date: Date) {
  return prisma.membership.findFirst({ where: { userId: studentId, startDate: { lte: date }, OR: [{ endDate: null }, { endDate: { gte: date } }] } });
}

async function meal(studentId: string, day: string, type: MealType) {
  const date = dateValue(day);
  const [membership, closure, booking, times, leave, publishedMenu] = await Promise.all([
    membershipFor(studentId, date),
    prisma.closure.findFirst({ where: { date, OR: [{ mealType: null }, { mealType: type }] } }),
    prisma.booking.findUnique({ where: { studentId_mealType_mealDate: { studentId, mealType: type, mealDate: date } } }),
    resolveMealTimes(type, date),
    prisma.leave.findFirst({ where: { userId: studentId, status: "ACTIVE", startDate: { lte: date }, endDate: { gte: date }, mealTypes: { has: type } } }),
    prisma.publishedMenu.findUnique({ where: { date_mealType: { date, mealType: type } }, select: { title: true, description: true } }),
  ]);
  if (!times) return null;
  const status = closure ? "CANCELLED_MESS_CLOSED"
    : !membership ? "NOT_ELIGIBLE"
    : leave ? "ON_LEAVE"
    : booking?.status === "REDEEMED" ? "REDEEMED"
    : booking?.status === "CANCELLED_USER" ? "CANCELLED_BY_STUDENT"
    : booking?.status === "CANCELLED_LEAVE" ? "ON_LEAVE"
    : booking?.status === "CANCELLED_CLOSED" ? "CANCELLED_MESS_CLOSED"
    : booking?.status === "BOOKED" ? (Date.now() >= times.end.getTime() ? "EXPIRED_UNCONSUMED" : Date.now() >= times.cutoff.getTime() ? "LOCKED" : "BOOKED")
    : "NOT_BOOKED";
  return { id: `${day}_${type.toLowerCase()}`, type: type.toLowerCase(), date: day, status, closed: !!closure,
    menu: publishedMenu,
    serviceStart: times.start.toISOString(), serviceEnd: times.end.toISOString(), cutoffAt: times.cutoff.toISOString() };
}

function parseId(id: string) {
  const match = /^(\d{4}-\d{2}-\d{2})_(breakfast|lunch|dinner)$/.exec(id);
  if (!match || !validDate(match[1])) return null;
  return { day: match[1], type: match[2].toUpperCase() as MealType };
}

mealsRouter.get("/", async (req, res) => {
  const day = req.query.date;
  if (!validDate(day)) { res.status(400).json({ message: "Use a valid date (YYYY-MM-DD)." }); return; }
  const userId = res.locals.user.id as string;
  const result = await Promise.all(types.map(t => meal(userId, day, t)));
  if (result.some(x => !x)) { res.status(503).json({ message: "Meal timings are not configured. Ask the administrator to set them." }); return; }
  res.json(result);
});

mealsRouter.put("/:id/booking", async (req, res) => {
  const id = typeof req.params.id === "string" ? req.params.id : "";
  const parsed = parseId(id);
  if (!parsed || typeof req.body?.booked !== "boolean") { res.status(400).json({ message: "Invalid meal or booking choice." }); return; }
  const { day, type } = parsed;
  const date = dateValue(day);
  const userId = res.locals.user.id as string;
  const current = await meal(userId, day, type);
  if (!current) { res.status(503).json({ message: "Meal timings are not configured." }); return; }
  if (current.status === "NOT_ELIGIBLE") { res.status(403).json({ message: "Your mess membership is not active for this date." }); return; }
  if (current.status === "ON_LEAVE") { res.status(409).json({ message: "You are on leave for this meal. Cancel leave first." }); return; }
  if (current.closed) { res.status(409).json({ message: "UNAVAILABLE — MESS CLOSED" }); return; }
  if (Date.now() >= new Date(current.cutoffAt).getTime()) { res.status(409).json({ message: "The booking cutoff has passed." }); return; }
  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))::text`;
    const onLeave = await tx.leave.findFirst({ where: { userId, status: "ACTIVE", startDate: { lte: date }, endDate: { gte: date }, mealTypes: { has: type } } });
    if (onLeave) return "ON_LEAVE";
    const key = { studentId_mealType_mealDate: { studentId: userId, mealType: type, mealDate: date } };
    const existing = await tx.booking.findUnique({ where: key });
    if (existing?.status === "REDEEMED" || existing?.status === "CANCELLED_LEAVE" || existing?.status === "CANCELLED_CLOSED") return "LOCKED";
    let changed = false;
    if (existing && existing.status !== (req.body.booked ? "BOOKED" : "CANCELLED_USER")) {
      await tx.booking.updateMany({ where: { id: existing.id, status: { in: ["BOOKED", "CANCELLED_USER"] } }, data: { status: req.body.booked ? "BOOKED" : "CANCELLED_USER" } });
      changed = true;
    } else if (req.body.booked) {
      if (!existing) {
        const bookingId = randomUUID();
        const { qrTokenHash, manualCode } = generateBookingSecrets(bookingId);
        await tx.booking.create({ data: { id: bookingId, studentId: userId, mealType: type, mealDate: date, qrTokenHash, manualCode } });
        changed = true;
      }
    }
    if (changed) await tx.notification.create({ data: { userId, kind: "success", title: req.body.booked ? "Meal booked" : "Meal cancelled", body: `${type.toLowerCase()} on ${day} was ${req.body.booked ? "booked" : "cancelled"}.` } });
    return "OK";
  });
  if (result !== "OK") { res.status(409).json({ message: result === "ON_LEAVE" ? "You are on leave for this meal. Cancel leave first." : "This booking cannot be changed." }); return; }
  res.json(await meal(userId, day, type));
});
