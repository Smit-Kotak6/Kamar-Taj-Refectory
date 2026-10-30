import { Router } from "express";
import { authenticate, requireRole } from "./auth.js";
import { prisma } from "./db.js";
import { todayInTz } from "./mealSchedule.js";
import { dateValue, parseMealType, validDate } from "./mealRates.js";

export const adminWasteRouter = Router();
adminWasteRouter.use(authenticate, requireRole("ADMIN", "SUPER_ADMIN"));

adminWasteRouter.get("/waste", async (req, res) => {
  const month = req.query.month ?? todayInTz().slice(0, 7);
  if (typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    res.status(400).json({ code: "BAD_REQUEST", message: "Use a valid month (YYYY-MM)." }); return;
  }
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const end = new Date(Date.UTC(year, monthNumber, 1));
  if (start.toISOString().slice(0, 7) !== month) {
    res.status(400).json({ code: "BAD_REQUEST", message: "Use a valid month (YYYY-MM)." }); return;
  }
  const rows = await prisma.measuredWaste.findMany({ where: { date: { gte: start, lt: end } }, orderBy: [{ date: "desc" }, { mealType: "asc" }] });
  const preparedGrams = rows.reduce((sum, row) => sum + row.preparedGrams, 0);
  const wastedGrams = rows.reduce((sum, row) => sum + row.wastedGrams, 0);
  res.json({ month, totals: { preparedGrams, wastedGrams, wastePercent: preparedGrams ? Math.round(wastedGrams / preparedGrams * 1000) / 10 : null },
    records: rows.map(row => ({ id: row.id, date: row.date.toISOString().slice(0, 10), mealType: row.mealType.toLowerCase(), preparedGrams: row.preparedGrams, wastedGrams: row.wastedGrams, note: row.note, updatedAt: row.updatedAt.toISOString() })) });
});

adminWasteRouter.put("/waste/:date/:mealType", async (req, res) => {
  const day = req.params.date;
  const type = parseMealType(req.params.mealType);
  const { preparedGrams, wastedGrams, note } = req.body ?? {};
  if (!validDate(day) || !type || !Number.isInteger(preparedGrams) || !Number.isInteger(wastedGrams) || preparedGrams < 0 || preparedGrams > 10_000_000 || wastedGrams < 0 || wastedGrams > preparedGrams || typeof note !== "string" || note.length > 500) {
    res.status(400).json({ code: "BAD_REQUEST", message: "Enter a valid date, meal, measured weights (waste cannot exceed prepared), and a note under 500 characters." }); return;
  }
  const date = dateValue(day);
  const recordedById = res.locals.user.id as string;
  const row = await prisma.measuredWaste.upsert({
    where: { date_mealType: { date, mealType: type } },
    create: { date, mealType: type, preparedGrams, wastedGrams, note, recordedById },
    update: { preparedGrams, wastedGrams, note, recordedById },
  });
  res.json({ id: row.id, date: day, mealType: type.toLowerCase(), preparedGrams: row.preparedGrams, wastedGrams: row.wastedGrams, note: row.note });
});

