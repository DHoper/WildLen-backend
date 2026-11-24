-- CreateEnum
CREATE TYPE "PlaceKind" AS ENUM ('PROTECTED_AREA', 'WETLAND', 'FOREST', 'COAST', 'MOUNTAIN', 'URBAN_PARK', 'OTHER');

-- CreateEnum
CREATE TYPE "PlaceStatus" AS ENUM ('CURATED', 'PROPOSED');

-- AlterEnum
ALTER TYPE "PhotoLicense" ADD VALUE 'CC0';

-- AlterTable
ALTER TABLE "photo_posts" ADD COLUMN     "place_id" INTEGER,
ADD COLUMN     "source_author" TEXT,
ADD COLUMN     "source_id" TEXT,
ADD COLUMN     "source_license" TEXT,
ADD COLUMN     "source_name" TEXT,
ADD COLUMN     "source_url" TEXT;

-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "place_id" INTEGER;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "is_system" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "places" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "kind" "PlaceKind" NOT NULL,
    "country_code" TEXT NOT NULL,
    "area" TEXT NOT NULL DEFAULT 'other',
    "region" JSONB NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "radius_m" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL,
    "description" JSONB,
    "access" JSONB,
    "guidelines" JSONB,
    "cover_url" TEXT,
    "status" "PlaceStatus" NOT NULL DEFAULT 'PROPOSED',
    "created_by_id" INTEGER,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "places_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "places_slug_key" ON "places"("slug");

-- CreateIndex
CREATE INDEX "places_status_idx" ON "places"("status");

-- CreateIndex
CREATE INDEX "places_area_idx" ON "places"("area");

-- CreateIndex
CREATE INDEX "places_created_by_id_idx" ON "places"("created_by_id");

-- CreateIndex
CREATE INDEX "photo_posts_place_id_idx" ON "photo_posts"("place_id");

-- CreateIndex
CREATE UNIQUE INDEX "photo_posts_source_name_source_id_key" ON "photo_posts"("source_name", "source_id");

-- AddForeignKey
ALTER TABLE "photo_posts" ADD CONSTRAINT "photo_posts_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "places" ADD CONSTRAINT "places_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

