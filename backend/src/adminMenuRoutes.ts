import { Router } from "express";
import { authenticate, requireRole } from "./auth.js";
import { prisma } from "./db.js";
import { resolveMealTimes, todayInTz } from "./mealSchedule.js";
import { dateValue, parseMealType, rateMealTypes, validDate } from "./mealRates.js";

export const adminMenuRouter = Router();
adminMenuRouter.use(authenticate, requireRole("ADMIN", "SUPER_ADMIN"));

async function canEditMenu(day: string, type: (typeof rateMealTypes)[number], now = new Date()) {
  const today = todayInTz();
  if (day < today) return false;
  if (day > today) return true;
  const times = await resolveMealTimes(type, dateValue(day));
  // Missing or invalid service times must not reopen an already served meal.
  return times !== null && now < times.end;
}

async function rejectLockedMenu(day: string, type: (typeof rateMealTypes)[number], res: import("express").Response) {
  if (await canEditMenu(day, type)) return false;
  res.status(409).json({ code: "MENU_LOCKED", message: "This meal has ended or its date has passed. Its menu can no longer be changed." });
  return true;
}

adminMenuRouter.get("/menu", async (req, res) => {
  const day = req.query.date ?? todayInTz();
  if (!validDate(day)) { res.status(400).json({ code: "BAD_REQUEST", message: "Use a valid date (YYYY-MM-DD)." }); return; }
  const menus = await prisma.publishedMenu.findMany({ where: { date: dateValue(day) }, select: { mealType: true, title: true, description: true, updatedAt: true } });
  const editable = await Promise.all(rateMealTypes.map(type => canEditMenu(day, type)));
  res.json({ date: day, meals: rateMealTypes.map((type, index) => {
    const row = menus.find(menu => menu.mealType === type);
    return { mealType: type.toLowerCase(), editable: editable[index], menu: row ? { title: row.title, description: row.description, updatedAt: row.updatedAt.toISOString() } : null };
  }) });
});

adminMenuRouter.put("/menu/:date/:mealType", async (req, res) => {
  const day = req.params.date;
  const type = parseMealType(req.params.mealType);
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
  if (!validDate(day) || !type || title.length < 2 || title.length > 120 || description.length > 500) {
    res.status(400).json({ code: "BAD_REQUEST", message: "Choose a valid date and meal, a menu title of 2–120 characters and notes up to 500 characters." }); return;
  }
  if (await rejectLockedMenu(day, type, res)) return;
  const date = dateValue(day);
  const publishedById = res.locals.user.id as string;
  const row = await prisma.publishedMenu.upsert({
    where: { date_mealType: { date, mealType: type } },
    create: { date, mealType: type, title, description, publishedById },
    update: { title, description, publishedById },
  });
  res.json({ date: day, mealType: type.toLowerCase(), menu: { title: row.title, description: row.description, updatedAt: row.updatedAt.toISOString() } });
});

adminMenuRouter.delete("/menu/:date/:mealType", async (req, res) => {
  const day = req.params.date;
  const type = parseMealType(req.params.mealType);
  if (!validDate(day) || !type) { res.status(400).json({ code: "BAD_REQUEST", message: "Use a valid date and meal." }); return; }
  if (await rejectLockedMenu(day, type, res)) return;
  await prisma.publishedMenu.deleteMany({ where: { date: dateValue(day), mealType: type } });
  res.status(204).end();
});
