-- CreateTable
CREATE TABLE "MealSchedule" (
    "mealType" "MealType" NOT NULL,
    "cutoffTime" TEXT NOT NULL,
    "serviceStart" TEXT NOT NULL,
    "serviceEnd" TEXT NOT NULL,

    CONSTRAINT "MealSchedule_pkey" PRIMARY KEY ("mealType")
);

-- CreateTable
CREATE TABLE "MealOverride" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "mealType" "MealType" NOT NULL,
    "cutoffTime" TEXT,
    "serviceStart" TEXT,
    "serviceEnd" TEXT,

    CONSTRAINT "MealOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MealOverride_date_mealType_key" ON "MealOverride"("date", "mealType");
