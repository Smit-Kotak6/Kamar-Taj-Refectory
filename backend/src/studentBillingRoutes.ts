import { Router } from "express";
import { authenticate, requireRole } from "./auth.js";
import { prisma } from "./db.js";
import { todayInTz } from "./mealSchedule.js";
import { rateSchedule } from "./mealRates.js";

export const studentBillingRouter = Router();
studentBillingRouter.use(authenticate, requireRole("STUDENT"));

studentBillingRouter.get("/billing", async (req, res) => {
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
  const [rows, rateAt] = await Promise.all([prisma.booking.findMany({
    where: { studentId: res.locals.user.id as string, mealDate: { gte: start, lt: end } },
    select: { id: true, mealDate: true, mealType: true, status: true, redeemedAt: true },
    orderBy: [{ mealDate: "desc" }, { mealType: "asc" }],
  }), rateSchedule(start, end)]);
  const meals = rows.map(row => ({
    id: row.id,
    date: row.mealDate.toISOString().slice(0, 10),
    mealType: row.mealType.toLowerCase(),
    status: row.status,
    redeemedAt: row.redeemedAt?.toISOString() ?? null,
    chargePaise: rateAt(row.mealDate, row.mealType).amountPaise,
    rebatePaise: row.status.startsWith("CANCELLED_") ? rateAt(row.mealDate, row.mealType).amountPaise : 0,
  }));
  const grossPaise = meals.reduce((total, row) => total + row.chargePaise, 0);
  const rebatePaise = meals.reduce((total, row) => total + row.rebatePaise, 0);
  res.json({
    month,
    totals: {
      booked: rows.filter(row => row.status === "BOOKED" || row.status === "REDEEMED").length,
      redeemed: rows.filter(row => row.status === "REDEEMED").length,
      cancelled: rows.filter(row => row.status.startsWith("CANCELLED_")).length,
    },
    meals,
    billingConfigured: true,
    policy: "Per recorded booking: meal rate charged; cancelled booking receives an equal offset. No payment balance is calculated.",
    amounts: { grossPaise, rebatePaise, netPaise: grossPaise - rebatePaise },
  });
});
