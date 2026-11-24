-- CreateEnum
CREATE TYPE "PhotoQuality" AS ENUM ('CASUAL', 'NEEDS_ID', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "EmailTokenType" AS ENUM ('VERIFY_EMAIL', 'RESET_PASSWORD');

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('photo', 'community', 'comment', 'user', 'poll');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('SPAM', 'HARASSMENT', 'INAPPROPRIATE', 'WILDLIFE_HARM', 'SENSITIVE_LOCATION', 'COPYRIGHT', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'FOLLOW';
ALTER TYPE "NotificationType" ADD VALUE 'IDENTIFICATION';

-- AlterTable
ALTER TABLE "articles" ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'zh-TW';

-- AlterTable
ALTER TABLE "photo_posts" ADD COLUMN     "quality" "PhotoQuality" NOT NULL DEFAULT 'CASUAL';

-- AlterTable
ALTER TABLE "species" ADD COLUMN     "description_en" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'zh-TW';

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" SERIAL NOT NULL,
    "token_hash" TEXT NOT NULL,
    "family_id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_tokens" (
    "id" SERIAL NOT NULL,
    "type" "EmailTokenType" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follows" (
    "follower_id" INTEGER NOT NULL,
    "following_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follows_pkey" PRIMARY KEY ("follower_id","following_id")
);

-- CreateTable
CREATE TABLE "blocks" (
    "blocker_id" INTEGER NOT NULL,
    "blocked_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocks_pkey" PRIMARY KEY ("blocker_id","blocked_id")
);

-- CreateTable
CREATE TABLE "bookmarks" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "photo_post_id" INTEGER,
    "community_post_id" INTEGER,
    "article_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identifications" (
    "id" SERIAL NOT NULL,
    "photo_post_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "species_id" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "identifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" SERIAL NOT NULL,
    "reporter_id" INTEGER NOT NULL,
    "target_type" "ReportTargetType" NOT NULL,
    "target_id" INTEGER NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "note" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolution_note" TEXT,
    "resolved_at" TIMESTAMP(3),
    "resolved_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_tokens_token_hash_key" ON "email_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "email_tokens_user_id_type_idx" ON "email_tokens"("user_id", "type");

-- CreateIndex
CREATE INDEX "follows_following_id_idx" ON "follows"("following_id");

-- CreateIndex
CREATE INDEX "blocks_blocked_id_idx" ON "blocks"("blocked_id");

-- CreateIndex
CREATE UNIQUE INDEX "bookmarks_user_id_photo_post_id_key" ON "bookmarks"("user_id", "photo_post_id");

-- CreateIndex
CREATE UNIQUE INDEX "bookmarks_user_id_community_post_id_key" ON "bookmarks"("user_id", "community_post_id");

-- CreateIndex
CREATE UNIQUE INDEX "bookmarks_user_id_article_id_key" ON "bookmarks"("user_id", "article_id");

-- CreateIndex
CREATE INDEX "identifications_species_id_idx" ON "identifications"("species_id");

-- CreateIndex
CREATE UNIQUE INDEX "identifications_photo_post_id_user_id_key" ON "identifications"("photo_post_id", "user_id");

-- CreateIndex
CREATE INDEX "reports_status_created_at_idx" ON "reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "reports_target_type_target_id_idx" ON "reports"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "reports_reporter_id_target_type_target_id_idx" ON "reports"("reporter_id", "target_type", "target_id");

-- CreateIndex
CREATE INDEX "articles_locale_idx" ON "articles"("locale");

-- CreateIndex
CREATE INDEX "photo_posts_quality_idx" ON "photo_posts"("quality");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_tokens" ADD CONSTRAINT "email_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_following_id_fkey" FOREIGN KEY ("following_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_photo_post_id_fkey" FOREIGN KEY ("photo_post_id") REFERENCES "photo_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_community_post_id_fkey" FOREIGN KEY ("community_post_id") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identifications" ADD CONSTRAINT "identifications_photo_post_id_fkey" FOREIGN KEY ("photo_post_id") REFERENCES "photo_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identifications" ADD CONSTRAINT "identifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identifications" ADD CONSTRAINT "identifications_species_id_fkey" FOREIGN KEY ("species_id") REFERENCES "species"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Data: tags are now stored as language-neutral keys ──
CREATE TEMP TABLE tag_map (label TEXT PRIMARY KEY, key TEXT NOT NULL);
INSERT INTO tag_map (label, key) VALUES
  ('生態系', 'ecosystems'),
  ('水生生物', 'aquatic-life'),
  ('魚類', 'fish'),
  ('陸生動物', 'land-animals'),
  ('節肢動物', 'arthropods'),
  ('兩棲動物', 'amphibians'),
  ('植物', 'plants'),
  ('瀕危物種', 'endangered-species'),
  ('危險動物', 'dangerous-animals'),
  ('鳥類', 'birds'),
  ('動物行為', 'animal-behavior'),
  ('遷徙', 'migration'),
  ('奇特行為', 'unusual-behavior'),
  ('攝影技巧', 'photography-tips'),
  ('野生動物保護區', 'wildlife-reserves'),
  ('海洋', 'ocean'),
  ('溪河湖泊', 'rivers-lakes'),
  ('山林', 'mountains'),
  ('森林', 'forest'),
  ('草原', 'grassland'),
  ('雪地', 'snow'),
  ('沙漠', 'desert'),
  ('海島', 'islands'),
  ('沼澤', 'wetlands'),
  ('自然風景', 'landscapes'),
  ('夜間攝影', 'night-photography'),
  ('微距攝影', 'macro'),
  ('野外探險', 'expeditions'),
  ('地理風貌', 'geography'),
  ('環境保育', 'conservation'),
  ('全球生態', 'global-ecology'),
  ('嚴重議題', 'critical-issues'),
  ('非洲', 'africa'),
  ('亞洲', 'asia'),
  ('南美洲', 'south-america'),
  ('北美洲', 'north-america'),
  ('歐洲', 'europe'),
  ('澳大利亞', 'australia'),
  ('南極洲', 'antarctica');

UPDATE "articles" SET "tags" = ARRAY(
  SELECT COALESCE(m.key, u.t)
  FROM unnest("tags") WITH ORDINALITY AS u(t, ord)
  LEFT JOIN tag_map m ON m.label = u.t
  ORDER BY u.ord
);

UPDATE "community_posts" SET "tags" = ARRAY(
  SELECT COALESCE(m.key, u.t)
  FROM unnest("tags") WITH ORDINALITY AS u(t, ord)
  LEFT JOIN tag_map m ON m.label = u.t
  ORDER BY u.ord
);

UPDATE "users" SET "interests" = ARRAY(
  SELECT COALESCE(m.key, u.t)
  FROM unnest("interests") WITH ORDINALITY AS u(t, ord)
  LEFT JOIN tag_map m ON m.label = u.t
  ORDER BY u.ord
);

DROP TABLE tag_map;

-- ── Data: initial photo quality (no identifications exist yet, so never CONFIRMED) ──
UPDATE "photo_posts" SET "quality" = CASE
  WHEN "taken_at" IS NULL OR "location_precision" = 'HIDDEN' THEN 'CASUAL'::"PhotoQuality"
  ELSE 'NEEDS_ID'::"PhotoQuality"
END;
