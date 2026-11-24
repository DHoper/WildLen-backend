-- AlterTable
ALTER TABLE "photo_posts" ADD COLUMN     "area" TEXT NOT NULL DEFAULT 'other';

-- CreateIndex
CREATE INDEX "photo_posts_area_idx" ON "photo_posts"("area");

-- CreateIndex
CREATE INDEX "trips_place_id_idx" ON "trips"("place_id");

