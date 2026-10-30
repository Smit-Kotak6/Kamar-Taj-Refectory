import { Router } from "express";
import { createHash, randomBytes, randomInt } from "node:crypto";
import rateLimit from "express-rate-limit";
import { prisma } from "./db.js";
import { authenticate, requireRole } from "./auth.js";
import { resolveMealTimes } from "./mealSchedule.js";

export const qrRouter = Router();
qrRouter.use(authenticate, requireRole("STUDENT"));
qrRouter.use(rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false }));
const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const makeCode = () => Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join("");
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

qrRouter.post("/:id", async (req, res) => {
  const id = typeof req.params.id === "string" ? req.params.id : "";
  const match = /^(\d{4}-\d{2}-\d{2})_(breakfast|lunch|dinner)$/.exec(id);
  if (!match) { res.status(400).json({ code: "BAD_REQUEST", message: "Invalid meal." }); return; }
  const mealDate = new Date(`${match[1]}T00:00:00.000Z`);
  if (Number.isNaN(mealDate.getTime()) || mealDate.toISOString().slice(0, 10) !== match[1]) {
    res.status(400).json({ code: "BAD_REQUEST", message: "Invalid meal date." }); return;
  }
  const mealType = match[2].toUpperCase() as "BREAKFAST" | "LUNCH" | "DINNER";
  const studentId = res.locals.user.id as string;
  const booking = await prisma.booking.findUnique({ where: { studentId_mealType_mealDate: { studentId, mealType, mealDate } }, include: { student: { include: { membership: true } } } });
  if (!booking || booking.status !== "BOOKED") { res.status(409).json({ code: "NOT_ELIGIBLE", message: "You need an active booking for this meal." }); return; }
  const membership = booking.student.membership;
  if (!membership || mealDate < membership.startDate || (membership.endDate && mealDate > membership.endDate)) {
    res.status(403).json({ code: "NOT_ELIGIBLE", message: "Membership inactive for this meal." }); return;
  }
  const closed = await prisma.closure.findFirst({ where: { date: mealDate, OR: [{ mealType: null }, { mealType }] } });
  if (closed) { res.status(409).json({ code: "MESS_CLOSED", message: "UNAVAILABLE — MESS CLOSED" }); return; }
  const times = await resolveMealTimes(mealType, mealDate);
  if (!times) { res.status(503).json({ code: "TIMING_NOT_CONFIGURED", message: "Meal schedule missing." }); return; }
  const now = new Date();
  if (now < times.start || now >= times.end) { res.status(409).json({ code: "NOT_ELIGIBLE", message: "QR codes are available during meal service only." }); return; }
  const expiresAt = new Date(Math.min(now.getTime() + 30_000, times.end.getTime()));
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = `KT1.${randomBytes(32).toString("base64url")}`;
    const code = makeCode();
    try {
      const update = await prisma.booking.updateMany({ where: { id: booking.id, status: "BOOKED" }, data: { qrTokenHash: hash(token), manualCode: code, qrExpiresAt: expiresAt } });
      if (!update.count) { res.status(409).json({ code: "NOT_ELIGIBLE", message: "Booking is no longer active." }); return; }
      res.json({ token, code, expiresAt: expiresAt.toISOString() }); return;
    } catch (error) {
      if (!(typeof error === "object" && error && "code" in error && error.code === "P2002")) throw error;
    }
  }
  res.status(503).json({ code: "RETRY", message: "Could not issue a code. Please try again." });
});
