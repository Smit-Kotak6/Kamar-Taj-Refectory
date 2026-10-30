import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { MealType } from "../generated/prisma/client.js";
import { prisma } from "./db.js";
import { authenticate, requireRole } from "./auth.js";
import { resolveMealTimes, todayInTz } from "./mealSchedule.js";

export const leaveRouter = Router();
leaveRouter.use(authenticate, requireRole("STUDENT"));
const mealTypes = ["BREAKFAST", "LUNCH", "DINNER"] as const;
type LeaveInput = { startDate: string; endDate: string; mealTypes: MealType[]; reason: string };
class Fault extends Error { constructor(public status: number, message: string) { super(message); } }
const dateAtUtc = (s: string) => new Date(`${s}T00:00:00.000Z`);
function isDay(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = dateAtUtc(s);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
function parseInput(body: unknown): LeaveInput {
  if (!body || typeof body !== "object") throw new Fault(400, "Invalid leave request.");
  const b = body as Record<string, unknown>;
  if (!isDay(b.startDate) || !isDay(b.endDate) || b.startDate < todayInTz() || b.endDate < b.startDate ||
      Math.round((dateAtUtc(b.endDate).getTime() - dateAtUtc(b.startDate).getTime()) / 86400000) >= 60) {
    throw new Fault(400, "Leave dates must start today or later and cover at most 60 days.");
  }
  if (!Array.isArray(b.mealTypes) || b.mealTypes.length === 0 || !b.mealTypes.every(t => typeof t === "string" && mealTypes.includes(t.toUpperCase() as MealType))) {
    throw new Fault(400, "Choose at least one valid meal type.");
  }
  const types = [...new Set(b.mealTypes.map(t => (t as string).toUpperCase() as MealType))];
  const reason = typeof b.reason === "string" ? b.reason.trim() : "";
  if (reason.length > 500) throw new Fault(400, "Reason must be at most 500 characters.");
  return { startDate: b.startDate, endDate: b.endDate, mealTypes: types, reason };
}
function slots(input: LeaveInput) {
  const result: Array<{ date: Date; type: MealType }> = [];
  for (let at = dateAtUtc(input.startDate).getTime(); at <= dateAtUtc(input.endDate).getTime(); at += 86400000) {
    for (const type of input.mealTypes) result.push({ date: new Date(at), type });
  }
  return result;
}
async function checkEligible(userId: string, input: LeaveInput) {
  const member = await prisma.membership.findUnique({ where: { userId } });
  if (!member || member.startDate > dateAtUtc(input.startDate) || (member.endDate && member.endDate < dateAtUtc(input.endDate))) {
    throw new Fault(403, "Your membership does not cover all leave dates.");
  }
  for (const { date, type } of slots(input)) {
    const times = await resolveMealTimes(type, date);
    if (!times) throw new Fault(503, "Meal timings are not configured.");
    if (Date.now() >= times.cutoff.getTime()) throw new Fault(409, "A selected meal has passed its leave cutoff. Choose later meals or dates.");
  }
}
function format(row: { id: string; startDate: Date; endDate: Date; mealTypes: MealType[]; reason: string; status: string; createdAt: Date }) {
  return { id: row.id, startDate: row.startDate.toISOString().slice(0, 10), endDate: row.endDate.toISOString().slice(0, 10),
    mealTypes: row.mealTypes.map(t => t.toLowerCase()), reason: row.reason, status: row.status, createdAt: row.createdAt.toISOString() };
}
async function run(res: import("express").Response, task: () => Promise<unknown>) {
  try { res.json(await task()); }
  catch (e) { if (e instanceof Fault) res.status(e.status).json({ message: e.message }); else throw e; }
}

leaveRouter.get("/", async (_req, res) => {
  const rows = await prisma.leave.findMany({ where: { userId: res.locals.user.id }, orderBy: { createdAt: "desc" } });
  res.json(rows.map(format));
});

leaveRouter.post("/", async (req, res) => run(res, async () => {
  const userId = res.locals.user.id as string;
  const input = parseInput(req.body);
  await checkEligible(userId, input);
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))::text`;
    const overlap = await tx.leave.findFirst({ where: { userId, status: "ACTIVE", startDate: { lte: dateAtUtc(input.endDate) }, endDate: { gte: dateAtUtc(input.startDate) }, mealTypes: { hasSome: input.mealTypes } } });
    if (overlap) throw new Fault(409, "You already have leave for a selected meal and date.");
    const row = await tx.leave.create({ data: { id: randomUUID(), userId, startDate: dateAtUtc(input.startDate), endDate: dateAtUtc(input.endDate), mealTypes: input.mealTypes, reason: input.reason } });
    await tx.booking.updateMany({ where: { studentId: userId, mealDate: { gte: dateAtUtc(input.startDate), lte: dateAtUtc(input.endDate) }, mealType: { in: input.mealTypes }, status: "BOOKED" }, data: { status: "CANCELLED_LEAVE" } });
    await tx.notification.create({ data: { userId, kind: "success", title: "Leave registered", body: `Leave from ${input.startDate} to ${input.endDate} was registered for ${input.mealTypes.map(t => t.toLowerCase()).join(", ")}.` } });
    return format(row);
  }, { timeout: 30_000 });
}));

leaveRouter.put("/:id", async (req, res) => run(res, async () => {
  const userId = res.locals.user.id as string;
  const id = String(req.params.id);
  const input = parseInput(req.body);
  await checkEligible(userId, input);
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))::text`;
    const old = await tx.leave.findFirst({ where: { id, userId, status: "ACTIVE" } });
    if (!old) throw new Fault(404, "Active leave not found.");
    const oldInput = { startDate: old.startDate.toISOString().slice(0, 10), endDate: old.endDate.toISOString().slice(0, 10), mealTypes: old.mealTypes, reason: old.reason };
    await checkEligible(userId, oldInput);
    const overlap = await tx.leave.findFirst({ where: { userId, id: { not: id }, status: "ACTIVE", startDate: { lte: dateAtUtc(input.endDate) }, endDate: { gte: dateAtUtc(input.startDate) }, mealTypes: { hasSome: input.mealTypes } } });
    if (overlap) throw new Fault(409, "You already have leave for a selected meal and date.");
    await tx.booking.updateMany({ where: { studentId: userId, mealDate: { gte: old.startDate, lte: old.endDate }, mealType: { in: old.mealTypes }, status: "CANCELLED_LEAVE" }, data: { status: "BOOKED" } });
    const row = await tx.leave.update({ where: { id }, data: { startDate: dateAtUtc(input.startDate), endDate: dateAtUtc(input.endDate), mealTypes: input.mealTypes, reason: input.reason } });
    await tx.booking.updateMany({ where: { studentId: userId, mealDate: { gte: dateAtUtc(input.startDate), lte: dateAtUtc(input.endDate) }, mealType: { in: input.mealTypes }, status: "BOOKED" }, data: { status: "CANCELLED_LEAVE" } });
    await tx.notification.create({ data: { userId, kind: "info", title: "Leave updated", body: `Your leave now runs from ${input.startDate} to ${input.endDate}.` } });
    return format(row);
  }, { timeout: 30_000 });
}));

leaveRouter.delete("/:id", async (req, res) => run(res, async () => {
  const userId = res.locals.user.id as string;
  const id = String(req.params.id);
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))::text`;
    const old = await tx.leave.findFirst({ where: { id, userId } });
    if (!old) throw new Fault(404, "Leave not found.");
    if (old.status === "CANCELLED") return format(old);
    const oldInput = { startDate: old.startDate.toISOString().slice(0, 10), endDate: old.endDate.toISOString().slice(0, 10), mealTypes: old.mealTypes, reason: old.reason };
    await checkEligible(userId, oldInput);
    await tx.booking.updateMany({ where: { studentId: userId, mealDate: { gte: old.startDate, lte: old.endDate }, mealType: { in: old.mealTypes }, status: "CANCELLED_LEAVE" }, data: { status: "BOOKED" } });
    const row = await tx.leave.update({ where: { id }, data: { status: "CANCELLED" } });
    await tx.notification.create({ data: { userId, kind: "info", title: "Leave cancelled", body: `Your leave from ${oldInput.startDate} to ${oldInput.endDate} was cancelled.` } });
    return format(row);
  }, { timeout: 30_000 });
}));
