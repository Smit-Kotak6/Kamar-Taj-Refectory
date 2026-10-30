import { Router } from "express";
import { prisma } from "./db.js";
import { authenticate, requireRole } from "./auth.js";

export const studentAccountRouter = Router();
studentAccountRouter.use(authenticate, requireRole("STUDENT"));
const defaults = { diet: "veg", allergies: [] as string[], notes: "", reminderEnabled: true, reminderMinutes: 30 };
function publicPreferences(row: typeof defaults) {
  return { diet: row.diet, allergies: row.allergies, notes: row.notes, reminderEnabled: row.reminderEnabled, reminderMinutes: row.reminderMinutes };
}

studentAccountRouter.get("/preferences", async (_req, res) => {
  const row = await prisma.studentPreferences.findUnique({ where: { userId: res.locals.user.id } });
  res.json(publicPreferences(row ?? defaults));
});

studentAccountRouter.put("/preferences", async (req, res) => {
  const b = req.body;
  if (!b || !["veg", "non-veg", "eggetarian"].includes(b.diet) ||
      !Array.isArray(b.allergies) || b.allergies.length > 30 ||
      !b.allergies.every((a: unknown) => typeof a === "string" && a.length <= 80) ||
      typeof b.notes !== "string" || b.notes.length > 500 ||
      typeof b.reminderEnabled !== "boolean" || !Number.isInteger(b.reminderMinutes) ||
      b.reminderMinutes < 5 || b.reminderMinutes > 120) {
    res.status(400).json({ message: "Check diet, allergies, notes and reminder settings." }); return;
  }
  const data = { diet: b.diet as string, allergies: [...new Set((b.allergies as string[]).map(a => a.trim()).filter(Boolean))],
    notes: b.notes.trim(), reminderEnabled: b.reminderEnabled as boolean, reminderMinutes: b.reminderMinutes as number };
  const row = await prisma.$transaction(async tx => {
    const saved = await tx.studentPreferences.upsert({ where: { userId: res.locals.user.id }, create: { userId: res.locals.user.id, ...data }, update: data });
    await tx.notification.create({ data: { userId: res.locals.user.id, kind: "info", title: "Preferences saved", body: "Your food preferences were saved to your account." } });
    return saved;
  });
  res.json(publicPreferences(row));
});

studentAccountRouter.get("/notifications", async (_req, res) => {
  const rows = await prisma.notification.findMany({ where: { userId: res.locals.user.id }, orderBy: { createdAt: "desc" } });
  res.json(rows.map(n => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, createdAt: n.createdAt.toISOString(), read: n.read })));
});

studentAccountRouter.patch("/notifications/read-all", async (_req, res) => {
  await prisma.notification.updateMany({ where: { userId: res.locals.user.id, read: false }, data: { read: true } });
  res.json({ ok: true });
});

studentAccountRouter.patch("/notifications/:id/read", async (req, res) => {
  const id = typeof req.params.id === "string" ? req.params.id : "";
  const result = await prisma.notification.updateMany({ where: { id, userId: res.locals.user.id }, data: { read: true } });
  if (!result.count) { res.status(404).json({ message: "Notification not found." }); return; }
  res.json({ ok: true });
});
