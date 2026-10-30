import { prisma } from "./db.js";

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !email.endsWith("@mnnit.ac.in")) {
  console.error("Usage: npx tsx src/promoteDemoAdmin.ts your-separate-admin@mnnit.ac.in");
  process.exit(1);
}
try {
  const user = await prisma.user.findUnique({ where: { email }, include: { bookings: { take: 1 } } });
  if (!user || user.role !== "STUDENT" || user.bookings.length) throw new Error("Use a separate newly signed-up account with no meal bookings.");
  await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
  console.log(`Admin enabled for ${email}. Sign out and sign in again.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
