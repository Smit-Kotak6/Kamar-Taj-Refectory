/**
 * Seeds PLACEHOLDER default timings. Only the lunch cutoff (10:30) is confirmed in the spec;
 * every other value below is a temporary demo value and must be replaced with the real
 * college timings (spec section 8.2).
 *
 *   npx tsx src/seedSchedule.ts             -> default schedule
 *   npx tsx src/seedSchedule.ts --open-now  -> ALSO override today's meals to be open all day (for testing)
 */
import { prisma } from "./db.js";
import { todayInTz } from "./mealSchedule.js";

const defaults = [
  { mealType: "BREAKFAST", cutoffTime: "06:30", serviceStart: "07:30", serviceEnd: "09:30" },
  { mealType: "LUNCH",     cutoffTime: "10:30", serviceStart: "12:00", serviceEnd: "14:30" },
  { mealType: "DINNER",    cutoffTime: "17:30", serviceStart: "19:30", serviceEnd: "21:30" },
] as const;

async function main() {
  for (const d of defaults)
    await prisma.mealSchedule.upsert({ where: { mealType: d.mealType }, update: d, create: d });
  console.log("Default schedule saved.");

  if (process.argv.includes("--open-now")) {
    const date = new Date(todayInTz());
    for (const d of defaults)
      await prisma.mealOverride.upsert({
        where: { date_mealType: { date, mealType: d.mealType } },
        update: { serviceStart: "00:00", serviceEnd: "23:59" },
        create: { date, mealType: d.mealType, serviceStart: "00:00", serviceEnd: "23:59" },
      });
    console.log(`Today (${todayInTz()}) overridden: all meals open 00:00-23:59 for testing.`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
