import "dotenv/config";
import { prisma } from "./db.js";
import { todayInTz } from "./mealSchedule.js";

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^[a-z0-9._%+-]+@mnnit\.ac\.in$/.test(email)) {
  console.error("Usage: npx tsx src/activateDemoStudent.ts student@mnnit.ac.in");
  process.exit(1);
}

try {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.role !== "STUDENT") throw new Error("Student account not found.");
  const startDate = new Date(`${todayInTz()}T00:00:00.000Z`);
  if (await prisma.membership.findUnique({ where: { userId: user.id } })) {
    console.log("Membership already exists; no changes made.");
  } else {
    await prisma.membership.create({ data: { userId: user.id, startDate } });
    console.log(`Demo membership activated for ${email}, starting ${todayInTz()}.`);
  }
  const defaults = [
    { mealType: "BREAKFAST", cutoffTime: "06:30", serviceStart: "07:30", serviceEnd: "09:30" },
    { mealType: "LUNCH", cutoffTime: "10:30", serviceStart: "12:00", serviceEnd: "14:30" },
    { mealType: "DINNER", cutoffTime: "17:30", serviceStart: "19:30", serviceEnd: "21:30" },
  ] as const;
  for (const item of defaults) {
    await prisma.mealSchedule.createMany({ data: [item], skipDuplicates: true });
  }
  console.log("Missing meal timings filled with sample values; existing timings preserved.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Setup failed.");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
