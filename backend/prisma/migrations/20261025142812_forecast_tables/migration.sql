-- CreateTable
CREATE TABLE "DailyMealStat" (
    "date" DATE NOT NULL,
    "mealType" "MealType" NOT NULL,
    "booked" INTEGER NOT NULL,
    "consumed" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'SYNTHETIC',

    CONSTRAINT "DailyMealStat_pkey" PRIMARY KEY ("date","mealType")
);

-- CreateTable
CREATE TABLE "MealForecast" (
    "date" DATE NOT NULL,
    "mealType" "MealType" NOT NULL,
    "booked" INTEGER NOT NULL,
    "expected" INTEGER NOT NULL,
    "low" INTEGER NOT NULL,
    "high" INTEGER NOT NULL,
    "predictedRate" DOUBLE PRECISION NOT NULL,
    "modelInfo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealForecast_pkey" PRIMARY KEY ("date","mealType")
);
