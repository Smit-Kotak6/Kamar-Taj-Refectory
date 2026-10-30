import { Router } from "express";
import { prisma } from "./db.js";
import { authenticate, requireRole } from "./auth.js";
import { todayInTz } from "./mealSchedule.js";

export const adminMembershipRouter = Router();
adminMembershipRouter.use(authenticate, requireRole("ADMIN", "SUPER_ADMIN"));
const validDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;

adminMembershipRouter.get("/users", async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";
  const users = await prisma.user.findMany({
    where: { role: "STUDENT", ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }] } : {}) },
    select: { id: true, name: true, email: true, membership: { select: { startDate: true, endDate: true } } },
    orderBy: { name: "asc" }, take: 100,
  });
  res.json(users.map(u => ({ ...u, membership: u.membership && { startDate: u.membership.startDate.toISOString().slice(0, 10), endDate: u.membership.endDate?.toISOString().slice(0, 10) ?? null } })));
});

adminMembershipRouter.put("/memberships/:userId", async (req, res) => {
  const id = typeof req.params.userId === "string" ? req.params.userId : "";
  const { startDate, endDate } = req.body ?? {};
  if (!validDate(startDate) || (endDate != null && !validDate(endDate)) || (endDate && endDate < startDate)) {
    res.status(400).json({ message: "Enter valid membership dates; end must be on or after start." }); return;
  }
  const student = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  if (student?.role !== "STUDENT") { res.status(404).json({ message: "Student not found." }); return; }
  const row = await prisma.membership.upsert({ where: { userId: id }, create: { userId: id, startDate: new Date(startDate), endDate: endDate ? new Date(endDate) : null }, update: { startDate: new Date(startDate), endDate: endDate ? new Date(endDate) : null } });
  const today = todayInTz();
  res.json({ startDate: row.startDate.toISOString().slice(0, 10), endDate: row.endDate?.toISOString().slice(0, 10) ?? null, activeToday: startDate <= today && (!endDate || endDate >= today) });
});
