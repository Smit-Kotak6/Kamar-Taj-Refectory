import { Router } from "express";
import { authenticate, requireRole } from "./auth.js";
import { prisma } from "./db.js";
import { todayInTz } from "./mealSchedule.js";
import { dateValue, parseMealType, rateMealTypes, rateSchedule, validAmount, validDate } from "./mealRates.js";

export const adminRateRouter = Router();
adminRateRouter.use(authenticate, requireRole("ADMIN", "SUPER_ADMIN"));

adminRateRouter.get("/rates", async (req, res) => {
  const day = req.query.date ?? todayInTz();
  if (!validDate(day)) { res.status(400).json({ code: "BAD_REQUEST", message: "Use a valid date (YYYY-MM-DD)." }); return; }
  const date = dateValue(day);
  const rateAt = await rateSchedule(date, new Date(date.getTime() + 86400000));
  res.json({ date: day, rates: rateMealTypes.map(type => ({ mealType: type.toLowerCase(), ...rateAt(date, type) })) });
});

adminRateRouter.put("/rates/defaults/:mealType", async (req, res) => {
  const type = parseMealType(req.params.mealType);
  const { effectiveFrom, amountPaise } = req.body ?? {};
  if (!type || !validDate(effectiveFrom) || effectiveFrom < todayInTz() || !validAmount(amountPaise)) {
    res.status(400).json({ code: "BAD_REQUEST", message: "Choose a meal, today or a future effective date, and an amount from ₹0 to ₹10,000." }); return;
  }
  await prisma.mealRateVersion.upsert({
    where: { mealType_effectiveFrom: { mealType: type, effectiveFrom: dateValue(effectiveFrom) } },
    create: { mealType: type, effectiveFrom: dateValue(effectiveFrom), amountPaise },
    update: { amountPaise },
  });
  res.json({ mealType: type.toLowerCase(), effectiveFrom, amountPaise });
});

adminRateRouter.put("/rates/overrides/:date/:mealType", async (req, res) => {
  const day = req.params.date;
  const type = parseMealType(req.params.mealType);
  const amountPaise = req.body?.amountPaise;
  if (!validDate(day) || day < todayInTz() || !type || !validAmount(amountPaise)) {
    res.status(400).json({ code: "BAD_REQUEST", message: "Choose a meal, today or a future date, and an amount from ₹0 to ₹10,000." }); return;
  }
  await prisma.mealRateOverride.upsert({
    where: { date_mealType: { date: dateValue(day), mealType: type } },
    create: { date: dateValue(day), mealType: type, amountPaise },
    update: { amountPaise },
  });
  res.json({ date: day, mealType: type.toLowerCase(), amountPaise });
});

adminRateRouter.delete("/rates/overrides/:date/:mealType", async (req, res) => {
  const day = req.params.date;
  const type = parseMealType(req.params.mealType);
  if (!validDate(day) || day < todayInTz() || !type) {
    res.status(400).json({ code: "BAD_REQUEST", message: "Choose a meal and today or a future date." }); return;
  }
  await prisma.mealRateOverride.deleteMany({ where: { date: dateValue(day), mealType: type } });
  res.status(204).end();
});
