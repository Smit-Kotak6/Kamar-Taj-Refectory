import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authenticate, requireRole } from "./auth.js";
import { redeemMeal, setServiceWindowProvider } from "./qrRedemption.js";
import { serviceWindow } from "./mealSchedule.js";
import { prisma } from "./db.js";
import { todayInTz } from "./mealSchedule.js";

setServiceWindowProvider(serviceWindow);
export const staffRouter = Router();
staffRouter.use(authenticate, requireRole("STAFF", "ADMIN", "SUPER_ADMIN"));
staffRouter.get("/summary", async (_req, res) => {
  const date = todayInTz();
  const redeemed = await prisma.booking.count({ where: { mealDate: new Date(`${date}T00:00:00.000Z`), status: "REDEEMED" } });
  res.json({ date, redeemed });
});
staffRouter.post("/redeem", rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false }), async (req, res) => {
  const input = req.body;
  if (!input || typeof input !== "object" ||
      !((typeof input.token === "string" && input.token.length <= 100) || (typeof input.manualCode === "string" && input.manualCode.length <= 20))) {
    res.status(400).json({ outcome: "not_eligible", message: "Enter a QR token or booking code." }); return;
  }
  const staff = res.locals.user as { id: string; role: "STAFF" | "ADMIN" | "SUPER_ADMIN" };
  const result = await redeemMeal(input, staff);
  if (result.ok) {
    res.json({ outcome: "valid", message: "Meal checked in.", studentName: result.studentName, mealType: result.mealType.toLowerCase(), redeemedAt: new Date().toISOString() });
    return;
  }
  const message: Record<string, string> = {
    INVALID_CODE: "Code not found or replaced by a newer code.", QR_EXPIRED: "Code expired. Ask the student to refresh it.",
    ALREADY_REDEEMED: "This meal was already checked in.", NOT_BOOKED: "No active booking for this meal.",
    MESS_CLOSED: "UNAVAILABLE — MESS CLOSED", MEMBERSHIP_INACTIVE: "Mess membership inactive.",
    TIMING_NOT_CONFIGURED: "Meal timings are not configured.", OUTSIDE_SERVICE_WINDOW: "Outside meal service hours.", FORBIDDEN: "Access denied.",
  };
  const outcome = result.reason === "QR_EXPIRED" ? "expired" : result.reason === "ALREADY_REDEEMED" ? "already_redeemed" : result.reason === "MESS_CLOSED" ? "closed" : "not_eligible";
  res.json({ outcome, message: message[result.reason] });
});
