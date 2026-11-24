-- CreateEnum
CREATE TYPE "SpeciesGroup" AS ENUM ('BIRD', 'MAMMAL', 'REPTILE', 'AMPHIBIAN', 'FISH', 'INSECT', 'OTHER');

-- CreateEnum
CREATE TYPE "ConservationStatus" AS ENUM ('LC', 'NT', 'VU', 'EN', 'CR');

-- CreateEnum
CREATE TYPE "LocationPrecision" AS ENUM ('EXACT', 'APPROX', 'HIDDEN');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('LIKE', 'COMMENT');

-- AlterTable
ALTER TABLE "photo_posts" ADD COLUMN     "exif" JSONB,
ADD COLUMN     "location_precision" "LocationPrecision" NOT NULL DEFAULT 'EXACT',
ADD COLUMN     "species_id" INTEGER,
ADD COLUMN     "taken_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "species" (
    "id" SERIAL NOT NULL,
    "common_name" TEXT NOT NULL,
    "scientific_name" TEXT NOT NULL,
    "english_name" TEXT,
    "group" "SpeciesGroup" NOT NULL,
    "status" "ConservationStatus" NOT NULL DEFAULT 'LC',
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "cover_image_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "species_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "type" "NotificationType" NOT NULL,
    "recipient_id" INTEGER NOT NULL,
    "actor_id" INTEGER NOT NULL,
    "photo_post_id" INTEGER,
    "community_post_id" INTEGER,
    "article_id" INTEGER,
    "comment_id" INTEGER,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "species_common_name_key" ON "species"("common_name");

-- CreateIndex
CREATE UNIQUE INDEX "species_scientific_name_key" ON "species"("scientific_name");

-- CreateIndex
CREATE INDEX "notifications_recipient_id_read_at_created_at_idx" ON "notifications"("recipient_id", "read_at", "created_at");

-- CreateIndex
CREATE INDEX "photo_posts_species_id_idx" ON "photo_posts"("species_id");

-- CreateIndex
CREATE INDEX "photo_posts_taken_at_idx" ON "photo_posts"("taken_at");

-- AddForeignKey
ALTER TABLE "photo_posts" ADD CONSTRAINT "photo_posts_species_id_fkey" FOREIGN KEY ("species_id") REFERENCES "species"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_photo_post_id_fkey" FOREIGN KEY ("photo_post_id") REFERENCES "photo_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_community_post_id_fkey" FOREIGN KEY ("community_post_id") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
