CREATE TABLE "PublishedMenu" (
  "date" DATE NOT NULL,
  "mealType" "MealType" NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "publishedById" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublishedMenu_pkey" PRIMARY KEY ("date", "mealType"),
  CONSTRAINT "PublishedMenu_title_length_check" CHECK (length("title") BETWEEN 2 AND 120),
  CONSTRAINT "PublishedMenu_description_length_check" CHECK (length("description") <= 500)
);
ALTER TABLE "PublishedMenu" ADD CONSTRAINT "PublishedMenu_publishedById_fkey"
  FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
