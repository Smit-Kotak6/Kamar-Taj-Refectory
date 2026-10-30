CREATE TABLE "MealRateVersion" (
  "mealType" "MealType" NOT NULL,
  "effectiveFrom" DATE NOT NULL,
  "amountPaise" INTEGER NOT NULL,
  CONSTRAINT "MealRateVersion_pkey" PRIMARY KEY ("mealType", "effectiveFrom"),
  CONSTRAINT "MealRateVersion_amountPaise_check" CHECK ("amountPaise" BETWEEN 0 AND 1000000)
);

CREATE TABLE "MealRateOverride" (
  "date" DATE NOT NULL,
  "mealType" "MealType" NOT NULL,
  "amountPaise" INTEGER NOT NULL,
  CONSTRAINT "MealRateOverride_pkey" PRIMARY KEY ("date", "mealType"),
  CONSTRAINT "MealRateOverride_amountPaise_check" CHECK ("amountPaise" BETWEEN 0 AND 1000000)
);

INSERT INTO "MealRateVersion" ("mealType", "effectiveFrom", "amountPaise") VALUES
  ('BREAKFAST', DATE '2000-01-01', 3000),
  ('LUNCH', DATE '2000-01-01', 6000),
  ('DINNER', DATE '2000-01-01', 5000);
