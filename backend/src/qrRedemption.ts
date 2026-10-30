/**
 * GOAL 3 - Prevent duplicate meal consumption via single-use QR verification
 * Stack: Node + Express + TypeScript + Prisma + PostgreSQL
 *
 * ---------------------------------------------------------------------------
 * 1) PRISMA SCHEMA (paste the relevant parts into schema.prisma)
 * ---------------------------------------------------------------------------
 *
 * enum BookingStatus { BOOKED CANCELLED_USER CANCELLED_LEAVE CANCELLED_CLOSED REDEEMED }
 * enum MealType      { BREAKFAST LUNCH DINNER }
 *
 * model Booking {
 *   id           String        @id @default(cuid())
 *   studentId    String
 *   mealType     MealType
 *   mealDate     DateTime      @db.Date
 *   status       BookingStatus @default(BOOKED)
 *   qrTokenHash  String        @unique   // SHA-256 of the random QR token (never store raw token)
 *   manualCode   String        @unique   // short fallback code, e.g. "K7M2-9QXA"
 *   redeemedAt   DateTime?
 *   redeemedById String?
 *   student      User          @relation(fields: [studentId], references: [id])
 *   consumption  Consumption?
 *   @@unique([studentId, mealType, mealDate])   // one booking per student per meal
 * }
 *
 * model Consumption {            // second line of defence: DB-level uniqueness
 *   id         String   @id @default(cuid())
 *   bookingId  String   @unique // <- a booking can NEVER have two consumption rows
 *   staffId    String
 *   createdAt  DateTime @default(now())
 *   booking    Booking  @relation(fields: [bookingId], references: [id])
 * }
 *
 * model Closure {                // mealType null => whole mess closed that day
 *   id       String    @id @default(cuid())
 *   date     DateTime  @db.Date
 *   mealType MealType?
 *   @@unique([date, mealType])
 * }
 */

import crypto from "crypto";
import type { MealType } from "../generated/prisma/client.js";
import { prisma } from "./db.js";

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/**
 * The QR token is HMAC-SHA256(QR_SECRET, bookingId):
 *  - unforgeable without the server secret
 *  - re-computable, so a student can open their QR any time
 *  - contains no personal data
 * The DB still stores only sha256(token) for lookups.
 */
export function tokenForBooking(bookingId: string): string {
  const secret = process.env.QR_SECRET;
  if (!secret) throw new Error("QR_SECRET is missing in .env");
  return crypto.createHmac("sha256", secret).update(bookingId).digest("base64url");
}

/** Called when a booking is CREATED (pass the booking's id). */
export function generateBookingSecrets(bookingId: string) {
  const token = tokenForBooking(bookingId);
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I confusion
  const pick = () => alphabet[crypto.randomInt(alphabet.length)];
  const manualCode = Array.from({ length: 8 }, pick).join("");
  return { token, qrTokenHash: sha256(token), manualCode };
}

const normalizeCode = (c: string) => c.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

// ---------------------------------------------------------------------------
// Service window lookup (Spec 8.4: if missing/invalid, BLOCK - never guess)
// Replace this stub with your MealSchedule + date-override tables.
// ---------------------------------------------------------------------------
type WindowProvider = (
  mealType: MealType,
  mealDate: Date
) => Promise<{ start: Date; end: Date } | null>;

// Default: no schedule configured -> redemption is BLOCKED (never guess).
// TODO: replace with real lookup: 1) date-specific override  2) default schedule.
let windowProvider: WindowProvider = async () => null;

/** Used by tests (and later by your real MealSchedule module) to supply windows. */
export function setServiceWindowProvider(p: WindowProvider) {
  windowProvider = p;
}

const getServiceWindow: WindowProvider = (mealType, mealDate) =>
  windowProvider(mealType, mealDate);

// ---------------------------------------------------------------------------
// Redemption
// ---------------------------------------------------------------------------
export type RedeemResult =
  | { ok: true; studentName: string; mealType: MealType }
  | { ok: false; reason:
      | "FORBIDDEN" | "INVALID_CODE" | "ALREADY_REDEEMED" | "NOT_BOOKED"
      | "MESS_CLOSED" | "MEMBERSHIP_INACTIVE" | "TIMING_NOT_CONFIGURED"
      | "OUTSIDE_SERVICE_WINDOW" | "QR_EXPIRED" };

const fail = (reason: Extract<RedeemResult, { ok: false }>["reason"]): RedeemResult =>
  ({ ok: false, reason });

/**
 * ONE function used by BOTH camera scan and manual entry (Spec 9.3).
 * `now` comes from the SERVER clock, never from the client (Spec 8.5).
 */
export async function redeemMeal(
  input: { token?: string; manualCode?: string },
  staff: { id: string; role: "STAFF" | "ADMIN" | "SUPER_ADMIN" | "STUDENT" },
  now: Date = new Date()
): Promise<RedeemResult> {
  // 1. Authorization (also enforce with middleware on the route)
  if (staff.role === "STUDENT") return fail("FORBIDDEN");

  // 2. Locate booking by hashed token OR manual code
  let where: { qrTokenHash: string } | { manualCode: string };
  if (input.token) where = { qrTokenHash: sha256(input.token) };
  else if (input.manualCode) where = { manualCode: normalizeCode(input.manualCode) };
  else return fail("INVALID_CODE");

  const booking = await prisma.booking.findUnique({
    where,
    include: { student: { include: { membership: true } } },
  });
  if (!booking) return fail("INVALID_CODE");

  // 3. Fast, readable checks (friendly error messages for staff)
  if (booking.status === "REDEEMED") return fail("ALREADY_REDEEMED");
  if (booking.status !== "BOOKED") return fail("NOT_BOOKED");
  if (!booking.qrExpiresAt || now >= booking.qrExpiresAt) return fail("QR_EXPIRED");

  // 4. Closure has priority over everything (Spec 10.3 / 10.5)
  const closed = await prisma.closure.findFirst({
    where: {
      date: booking.mealDate,
      OR: [{ mealType: null }, { mealType: booking.mealType }],
    },
  });
  if (closed) return fail("MESS_CLOSED");

  // 5. Membership must cover the meal date
  const m = booking.student.membership;
  if (!m || booking.mealDate < m.startDate || (m.endDate && booking.mealDate > m.endDate))
    return fail("MEMBERSHIP_INACTIVE");

  // 6. Service window / QR expiry
  const win = await getServiceWindow(booking.mealType, booking.mealDate);
  if (!win) return fail("TIMING_NOT_CONFIGURED");
  if (now < win.start || now > win.end) return fail("OUTSIDE_SERVICE_WINDOW");

  // 7. THE ATOMIC STEP. Only ONE concurrent request can flip BOOKED -> REDEEMED.
  //    updateMany with a status condition is a single SQL UPDATE ... WHERE status='BOOKED';
  //    the loser sees count === 0. The Consumption.bookingId unique constraint is a backstop.
  try {
    await prisma.$transaction(async (tx) => {
      const res = await tx.booking.updateMany({
        where: { id: booking.id, status: "BOOKED", redeemedAt: null,
          qrExpiresAt: { gt: now },
          ...(input.token ? { qrTokenHash: sha256(input.token) } : { manualCode: normalizeCode(input.manualCode!) }) },
        data: { status: "REDEEMED", redeemedAt: now, redeemedById: staff.id },
      });
      if (res.count !== 1) throw new Error("RACE_LOST");
      await tx.consumption.create({ data: { bookingId: booking.id, staffId: staff.id } });
      await tx.notification.create({ data: { userId: booking.studentId, kind: "success", title: "Meal checked in", body: `${booking.mealType.toLowerCase()} on ${booking.mealDate.toISOString().slice(0, 10)} was checked in.` } });
    });
  } catch (e: any) {
    if (e.message === "RACE_LOST" || e.code === "P2002") {
      const latest = await prisma.booking.findUnique({ where: { id: booking.id } });
      return fail(latest?.status === "REDEEMED" ? "ALREADY_REDEEMED" : "QR_EXPIRED");
    }
    throw e;
  }

  return { ok: true, studentName: booking.student.name, mealType: booking.mealType };
}

// ---------------------------------------------------------------------------
// Express route (add auth middleware + rate limiting, e.g. express-rate-limit,
// because the manual code is short and must not be brute-forceable)
// ---------------------------------------------------------------------------
// router.post("/api/staff/redeem", requireRole("STAFF","ADMIN"), rateLimiter, async (req, res) => {
//   const result = await redeemMeal(req.body, req.user);
//   res.status(result.ok ? 200 : 409).json(result);
// });

// ---------------------------------------------------------------------------
// Concurrency test idea (Stage 8): fire 20 redeemMeal() calls at once for the
// same token with Promise.all and assert exactly ONE returns ok:true.
// ---------------------------------------------------------------------------
