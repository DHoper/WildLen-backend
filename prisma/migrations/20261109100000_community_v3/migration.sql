-- CreateEnum
CREATE TYPE "TripDifficulty" AS ENUM ('EASY', 'MODERATE', 'HARD');

-- CreateEnum
CREATE TYPE "TripMemberStatus" AS ENUM ('GOING', 'WAITLIST');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'CRITIQUE';
ALTER TYPE "NotificationType" ADD VALUE 'TRIP_JOINED';
ALTER TYPE "NotificationType" ADD VALUE 'TRIP_CONFIRMED';

-- AlterTable
ALTER TABLE "likes" ADD COLUMN     "trip_id" INTEGER;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "tripId" INTEGER;

-- AlterTable
ALTER TABLE "photo_posts" ADD COLUMN     "critique_requested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trip_id" INTEGER;

-- CreateTable
CREATE TABLE "challenges" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "title" JSONB NOT NULL,
    "brief" JSONB NOT NULL,
    "rules" JSONB NOT NULL,
    "cover_url" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "submit_ends_at" TIMESTAMP(3) NOT NULL,
    "vote_ends_at" TIMESTAMP(3) NOT NULL,
    "species_group" "SpeciesGroup",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge_entries" (
    "id" SERIAL NOT NULL,
    "challenge_id" INTEGER NOT NULL,
    "photo_post_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "challenge_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge_votes" (
    "id" SERIAL NOT NULL,
    "entry_id" INTEGER NOT NULL,
    "challenge_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "challenge_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "organizer_id" INTEGER NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "meeting_point" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "capacity" INTEGER NOT NULL,
    "difficulty" "TripDifficulty" NOT NULL DEFAULT 'EASY',
    "target_species_ids" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "gear" TEXT NOT NULL DEFAULT '',
    "language" TEXT NOT NULL DEFAULT 'zh-TW',
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "discussion_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_members" (
    "trip_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "status" "TripMemberStatus" NOT NULL DEFAULT 'GOING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_members_pkey" PRIMARY KEY ("trip_id","user_id")
);

-- CreateTable
CREATE TABLE "critiques" (
    "id" SERIAL NOT NULL,
    "photo_post_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "composition" INTEGER NOT NULL,
    "light" INTEGER NOT NULL,
    "focus" INTEGER NOT NULL,
    "moment" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "critiques_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "challenges_slug_key" ON "challenges"("slug");

-- CreateIndex
CREATE INDEX "challenges_starts_at_idx" ON "challenges"("starts_at");

-- CreateIndex
CREATE INDEX "challenge_entries_challenge_id_user_id_idx" ON "challenge_entries"("challenge_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "challenge_entries_challenge_id_photo_post_id_key" ON "challenge_entries"("challenge_id", "photo_post_id");

-- CreateIndex
CREATE INDEX "challenge_votes_challenge_id_user_id_idx" ON "challenge_votes"("challenge_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "challenge_votes_entry_id_user_id_key" ON "challenge_votes"("entry_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "trips_discussion_id_key" ON "trips"("discussion_id");

-- CreateIndex
CREATE INDEX "trips_starts_at_idx" ON "trips"("starts_at");

-- CreateIndex
CREATE INDEX "trips_organizer_id_idx" ON "trips"("organizer_id");

-- CreateIndex
CREATE INDEX "trip_members_user_id_idx" ON "trip_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "critiques_photo_post_id_user_id_key" ON "critiques"("photo_post_id", "user_id");

-- CreateIndex
CREATE INDEX "photo_posts_critique_requested_idx" ON "photo_posts"("critique_requested");

-- CreateIndex
CREATE INDEX "photo_posts_trip_id_idx" ON "photo_posts"("trip_id");

-- AddForeignKey
ALTER TABLE "photo_posts" ADD CONSTRAINT "photo_posts_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "likes" ADD CONSTRAINT "likes_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_entries" ADD CONSTRAINT "challenge_entries_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_entries" ADD CONSTRAINT "challenge_entries_photo_post_id_fkey" FOREIGN KEY ("photo_post_id") REFERENCES "photo_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_entries" ADD CONSTRAINT "challenge_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_votes" ADD CONSTRAINT "challenge_votes_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "challenge_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_votes" ADD CONSTRAINT "challenge_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_discussion_id_fkey" FOREIGN KEY ("discussion_id") REFERENCES "community_posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_members" ADD CONSTRAINT "trip_members_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_members" ADD CONSTRAINT "trip_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "critiques" ADD CONSTRAINT "critiques_photo_post_id_fkey" FOREIGN KEY ("photo_post_id") REFERENCES "photo_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "critiques" ADD CONSTRAINT "critiques_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

