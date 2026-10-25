/** Creates a demo staff, a demo student with membership, and today's 3 bookings. Safe to re-run. */
import { prisma } from "./qrRedemption";
import { createBooking } from "./bookingService";

async function main() {
  const staff = await prisma.user.upsert({
    where: { email: "staff@demo.local" },
    update: {},
    create: { name: "Demo Staff", email: "staff@demo.local", role: "STAFF" },
  });
  const student = await prisma.user.upsert({
    where: { email: "student@demo.local" },
    update: {},
    create: {
      name: "Demo Student",
      email: "student@demo.local",
      membership: { create: { startDate: new Date("2026-01-01") } },
    },
  });

  const tz = process.env.INSTITUTE_TZ ?? "Asia/Kolkata";
  const today = new Date(new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date()));
  console.log("STAFF_ID  :", staff.id);
  console.log("STUDENT_ID:", student.id);
  for (const meal of ["BREAKFAST", "LUNCH", "DINNER"] as const) {
    const b = await createBooking(student.id, meal, today);
    console.log(`${meal.padEnd(9)} booking ${b.id}  manual code ${b.manualCode}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
