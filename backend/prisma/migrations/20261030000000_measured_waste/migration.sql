CREATE TABLE "MeasuredWaste" (
  "id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "mealType" "MealType" NOT NULL,
  "preparedGrams" INTEGER NOT NULL,
  "wastedGrams" INTEGER NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  "recordedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MeasuredWaste_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MeasuredWaste_quantities_check" CHECK ("preparedGrams" >= 0 AND "wastedGrams" >= 0 AND "wastedGrams" <= "preparedGrams")
);
CREATE UNIQUE INDEX "MeasuredWaste_date_mealType_key" ON "MeasuredWaste"("date", "mealType");
ALTER TABLE "MeasuredWaste" ADD CONSTRAINT "MeasuredWaste_recordedById_fkey"
  FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
