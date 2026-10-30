import "dotenv/config";
import { prisma } from "./db.js";

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^[a-z0-9._%+-]+@mnnit\.ac\.in$/.test(email)) {
  console.error("Usage: npx tsx src/promoteDemoStaff.ts staff-account@mnnit.ac.in");
  process.exit(1);
}
try {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || (user.role !== "STUDENT" && user.role !== "STAFF")) throw new Error("Find an existing student signup to promote.");
  if (await prisma.membership.findUnique({ where: { userId: user.id } })) throw new Error("This account has a mess membership. Create a separate staff test account.");
  if (user.role === "STAFF") console.log("Already STAFF; no changes made.");
  else {
    await prisma.user.update({ where: { id: user.id }, data: { role: "STAFF" } });
    console.log(`Staff test account ready: ${email}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Staff setup failed.");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
