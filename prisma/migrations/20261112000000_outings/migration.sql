-- CreateEnum
CREATE TYPE "OutingStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- AlterTable
ALTER TABLE "images" ADD COLUMN     "outing_id" INTEGER;

-- AlterTable
ALTER TABLE "photo_posts" ADD COLUMN     "outing_id" INTEGER;

-- CreateTable
CREATE TABLE "outings" (
    "id" SERIAL NOT NULL,
    "author_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "place_id" INTEGER,
    "location_name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "location_precision" "LocationPrecision" NOT NULL DEFAULT 'EXACT',
    "area" TEXT NOT NULL DEFAULT 'other',
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "notes" JSONB,
    "weather" JSONB,
    "distance_km" DOUBLE PRECISION,
    "trip_id" INTEGER,
    "status" "OutingStatus" NOT NULL DEFAULT 'DRAFT',
    "draft" JSONB,
    "language" TEXT NOT NULL DEFAULT 'zh-TW',
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outing_species" (
    "outing_id" INTEGER NOT NULL,
    "species_id" INTEGER NOT NULL,
    "count" INTEGER,
    "note" TEXT,
    "heard_only" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "outing_species_pkey" PRIMARY KEY ("outing_id","species_id")
);

-- CreateIndex
CREATE INDEX "outings_author_id_status_idx" ON "outings"("author_id", "status");

-- CreateIndex
CREATE INDEX "outings_place_id_idx" ON "outings"("place_id");

-- CreateIndex
CREATE INDEX "outings_trip_id_idx" ON "outings"("trip_id");

-- CreateIndex
CREATE INDEX "outings_started_at_idx" ON "outings"("started_at");

-- CreateIndex
CREATE INDEX "outings_area_idx" ON "outings"("area");

-- CreateIndex
CREATE INDEX "outing_species_species_id_idx" ON "outing_species"("species_id");

-- CreateIndex
CREATE INDEX "photo_posts_outing_id_idx" ON "photo_posts"("outing_id");

-- AddForeignKey
ALTER TABLE "photo_posts" ADD CONSTRAINT "photo_posts_outing_id_fkey" FOREIGN KEY ("outing_id") REFERENCES "outings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "images" ADD CONSTRAINT "images_outing_id_fkey" FOREIGN KEY ("outing_id") REFERENCES "outings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outings" ADD CONSTRAINT "outings_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outings" ADD CONSTRAINT "outings_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outings" ADD CONSTRAINT "outings_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outing_species" ADD CONSTRAINT "outing_species_outing_id_fkey" FOREIGN KEY ("outing_id") REFERENCES "outings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outing_species" ADD CONSTRAINT "outing_species_species_id_fkey" FOREIGN KEY ("species_id") REFERENCES "species"("id") ON DELETE CASCADE ON UPDATE CASCADE;

