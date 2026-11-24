-- Detected language of user content, for "content in my language" filters.
ALTER TABLE "photo_posts" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'zh-TW';
ALTER TABLE "community_posts" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'zh-TW';

-- Backfill: titles without any CJK character are English.
UPDATE "photo_posts" SET "language" = 'en' WHERE "title" !~ '[一-鿿]';
UPDATE "community_posts" SET "language" = 'en' WHERE "title" !~ '[一-鿿]';

CREATE INDEX "photo_posts_language_idx" ON "photo_posts"("language");
CREATE INDEX "community_posts_language_idx" ON "community_posts"("language");
