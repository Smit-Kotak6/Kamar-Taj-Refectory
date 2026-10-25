import { Router, Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import QRCode from "qrcode";
import { prisma, redeemMeal, tokenForBooking } from "./qrRedemption";

type Role = "STUDENT" | "STAFF" | "ADMIN" | "SUPER_ADMIN";
type AuthedRequest = Request & { user?: { id: string; role: Role } };

/**
 * !!! DEV ONLY !!!  Identifies the caller from an "x-user-id" header so you can test now.
 * Anyone can fake this header. Replace with real login (JWT/session) in Stage 6.
 */
export async function devAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  try {
    const id = req.header("x-user-id");
    if (id) {
      const u = await prisma.user.findUnique({ where: { id } });
      if (u) req.user = { id: u.id, role: u.role as Role };
    }
    next();
  } catch (e) {
    next(e);
  }
}

export const requireRole =
  (...roles: Role[]) =>
  (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Not logged in" });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "Forbidden" });
    next();
  };

// The manual code is short, so limit guessing attempts
const redeemLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });

export const router = Router();

// ---- STAFF: redeem by QR token or manual code (same server-side function) ----
router.post("/api/staff/redeem", redeemLimiter, requireRole("STAFF"), async (req: AuthedRequest, res) => {
  const { token, manualCode } = req.body ?? {};
  const result = await redeemMeal({ token, manualCode }, req.user!);
  res.status(result.ok ? 200 : 409).json(result);
});

// ---- STUDENT: only their OWN bookings ----
router.get("/api/student/bookings", requireRole("STUDENT"), async (req: AuthedRequest, res) => {
  const bookings = await prisma.booking.findMany({
    where: { studentId: req.user!.id },
    orderBy: [{ mealDate: "desc" }, { mealType: "asc" }],
    select: { id: true, mealType: true, mealDate: true, status: true },
  });
  res.json(bookings);
});

router.get("/api/student/bookings/:id/qr", requireRole("STUDENT"), async (req: AuthedRequest, res) => {
  const b = await prisma.booking.findUnique({ where: { id: String(req.params.id) } });
  // 404 (not 403) for other people's bookings: don't reveal that the id exists
  if (!b || b.studentId !== req.user!.id) return res.status(404).json({ error: "Booking not found" });
  if (b.status !== "BOOKED") return res.status(409).json({ error: `Booking is ${b.status}` });

  const token = tokenForBooking(b.id);
  const qrDataUrl = await QRCode.toDataURL(token, { margin: 1, width: 300 });
  res.json({ token, qrDataUrl, manualCode: b.manualCode });
});
