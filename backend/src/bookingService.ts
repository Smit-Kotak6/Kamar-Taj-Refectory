/** Creates ONE booking. Later, your nightly/default-booking job calls this per eligible student+meal. */
import crypto from "crypto";
import type { MealType } from "../generated/prisma/client.js";
import { prisma } from "./db.js";
import { generateBookingSecrets } from "./qrRedemption.js";

export async function createBooking(studentId: string, mealType: MealType, mealDate: Date) {
  const student = await prisma.user.findUnique({
    where: { id: studentId },
    include: { membership: true },
  });
  const m = student?.membership;
  if (!m) throw new Error("NO_MEMBERSHIP");
  if (mealDate < m.startDate || (m.endDate && mealDate > m.endDate))
    throw new Error("OUTSIDE_MEMBERSHIP"); // no bookings outside membership dates

  const closed = await prisma.closure.findFirst({
    where: { date: mealDate, OR: [{ mealType: null }, { mealType }] },
  });
  if (closed) throw new Error("MESS_CLOSED");

  // Idempotent: one booking per student per meal per date
  const existing = await prisma.booking.findUnique({
    where: { studentId_mealType_mealDate: { studentId, mealType, mealDate } },
  });
  if (existing) return existing;

  const id = crypto.randomUUID();
  const { qrTokenHash, manualCode } = generateBookingSecrets(id);
  return prisma.booking.create({
    data: { id, studentId, mealType, mealDate, qrTokenHash, manualCode },
  });
}
