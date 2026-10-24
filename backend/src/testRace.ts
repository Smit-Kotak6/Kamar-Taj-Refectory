/**
 * GOAL 3 DEMO - 20 simultaneous scans of the SAME QR code.
 * Expected result: exactly 1 success, 19 "ALREADY_REDEEMED".
 *
 * Run from backend/:   npx tsx src/testRace.ts
 */
import crypto from "crypto";
import {
  prisma,
  redeemMeal,
  generateBookingSecrets,
  setServiceWindowProvider,
} from "./qrRedemption";

async function main() {
  const stamp = Date.now();
  const today = new Date(new Date().toISOString().slice(0, 10)); // midnight UTC, matches @db.Date

  // Fake service window: "open from 1 hour ago until 1 hour from now"
  setServiceWindowProvider(async () => ({
    start: new Date(Date.now() - 60 * 60 * 1000),
    end: new Date(Date.now() + 60 * 60 * 1000),
  }));

  // --- Arrange: a staff user, a student with membership, and one booking ---
  const staff = await prisma.user.create({
    data: { name: "Test Staff", email: `staff-${stamp}@test.local`, role: "STAFF" },
  });
  const student = await prisma.user.create({
    data: {
      name: "Test Student",
      email: `student-${stamp}@test.local`,
      membership: { create: { startDate: new Date("2026-01-01") } },
    },
  });
  const bookingId = crypto.randomUUID();
  const { token, qrTokenHash, manualCode } = generateBookingSecrets(bookingId);
  const booking = await prisma.booking.create({
    data: { id: bookingId, studentId: student.id, mealType: "LUNCH", mealDate: today, qrTokenHash, manualCode },
  });

  try {
    // --- Act: 20 staff devices scan the same QR at the same instant ---
    const staffInfo = { id: staff.id, role: "STAFF" as const };
    const results = await Promise.all(
      Array.from({ length: 20 }, () => redeemMeal({ token }, staffInfo))
    );

    // --- Report ---
    const successes = results.filter((r) => r.ok).length;
    const reasons: Record<string, number> = {};
    for (const r of results) if (!r.ok) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;

    console.log("\n=== 20 simultaneous scans ===");
    console.log("Successful redemptions :", successes);
    console.log("Rejections             :", reasons);

    const rows = await prisma.consumption.count({ where: { bookingId: booking.id } });
    console.log("Consumption rows in DB :", rows);
    console.log(successes === 1 && rows === 1 ? "\nPASS: duplicate consumption prevented" : "\nFAIL");

    // Also try the manual-code path after redemption (should be rejected)
    const again = await redeemMeal({ manualCode }, staffInfo);
    console.log("Manual code after scan :", again);
  } finally {
    // --- Cleanup test data ---
    await prisma.consumption.deleteMany({ where: { bookingId: booking.id } });
    await prisma.booking.delete({ where: { id: booking.id } });
    await prisma.membership.deleteMany({ where: { userId: student.id } });
    await prisma.user.deleteMany({ where: { id: { in: [staff.id, student.id] } } });
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
