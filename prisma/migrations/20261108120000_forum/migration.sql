-- CreateEnum
CREATE TYPE "PostType" AS ENUM ('DISCUSSION', 'QUESTION');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ANSWER_ACCEPTED';

-- CreateTable
CREATE TABLE "forum_categories" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "description" JSONB NOT NULL,
    "color" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "admin_only" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "forum_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "forum_categories_key_key" ON "forum_categories"("key");

-- Data: the boards (the seed keeps them in sync; existing posts need one to move to)
INSERT INTO "forum_categories" ("key", "name", "description", "color", "icon", "position", "admin_only") VALUES
  ('identification', '{"zh-TW":"物種鑑定求助","en":"ID Help"}', '{"zh-TW":"拍到不認識的物種？附上照片與時間地點，請社群幫忙鑑定。","en":"Spotted something you can''t name? Share photos, date and place, and let the community help identify it."}', '#22577a', '🔍', 1, false),
  ('beginners', '{"zh-TW":"新手提問","en":"Beginner Questions"}', '{"zh-TW":"剛開始接觸野生動物攝影或自然觀察？任何問題都歡迎發問。","en":"New to wildlife photography or nature watching? No question is too basic."}', '#4f735e', '🌱', 2, false),
  ('techniques', '{"zh-TW":"拍攝技巧","en":"Techniques"}', '{"zh-TW":"構圖、光線、對焦與後製——交流拍攝野生動物的技巧與心得。","en":"Composition, light, focus and editing: share what works when photographing wildlife."}', '#c47f2c', '📷', 3, false),
  ('gear', '{"zh-TW":"器材討論","en":"Gear"}', '{"zh-TW":"機身、鏡頭、望遠鏡與野外裝備的選購與使用經驗。","en":"Bodies, lenses, binoculars and field kit: buying advice and hands-on experience."}', '#7c6a58', '🔭', 4, false),
  ('field-reports', '{"zh-TW":"野外紀錄","en":"Field Reports"}', '{"zh-TW":"分享你的野外觀察、旅程紀錄與難忘的相遇。","en":"Share your field observations, trip reports and memorable encounters."}', '#566e3d', '🥾', 5, false),
  ('conservation', '{"zh-TW":"保育議題","en":"Conservation"}', '{"zh-TW":"棲地、保育政策與拍攝倫理——討論我們能為野生動物做什麼。","en":"Habitats, policy and field ethics: what we can do for wildlife."}', '#9c3f2b', '🌏', 6, false),
  ('meetups', '{"zh-TW":"行程揪團","en":"Trips & Meetups"}', '{"zh-TW":"揪團賞鳥、夜觀、潛水或攝影行程，找到同好一起出發。","en":"Organise birding walks, night hikes, dives and photo trips with fellow enthusiasts."}', '#8a5a9e', '🚐', 7, false),
  ('announcements', '{"zh-TW":"站務公告","en":"Announcements"}', '{"zh-TW":"WildLens 官方公告、功能更新與社群守則。","en":"Official WildLens news, feature updates and community guidelines."}', '#1d2b24', '📣', 8, true);

-- AlterTable
ALTER TABLE "comments" ADD COLUMN     "edited" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "parent_id" INTEGER;

-- AlterTable: existing posts move to "field-reports"; the default is dropped afterwards
ALTER TABLE "community_posts" ADD COLUMN     "accepted_comment_id" INTEGER,
ADD COLUMN     "category_key" TEXT NOT NULL DEFAULT 'field-reports',
ADD COLUMN     "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "locked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "type" "PostType" NOT NULL DEFAULT 'DISCUSSION';
ALTER TABLE "community_posts" ALTER COLUMN "category_key" DROP DEFAULT;

-- Data: last activity = newest comment, or the post itself
UPDATE "community_posts" p SET "last_activity_at" = GREATEST(
  p."created_at",
  COALESCE((SELECT MAX(c."created_at") FROM "comments" c WHERE c."community_post_id" = p."id"), p."created_at")
);

-- AlterTable
ALTER TABLE "likes" ADD COLUMN     "comment_id" INTEGER;

-- A like targets exactly one of article / photo / post / comment.
ALTER TABLE "likes" DROP CONSTRAINT "likes_exactly_one_target";
ALTER TABLE "likes" ADD CONSTRAINT "likes_exactly_one_target"
  CHECK (num_nonnulls("article_id", "photo_post_id", "community_post_id", "comment_id") = 1);

-- CreateIndex
CREATE INDEX "comments_parent_id_idx" ON "comments"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "community_posts_accepted_comment_id_key" ON "community_posts"("accepted_comment_id");

-- CreateIndex
CREATE INDEX "community_posts_category_key_idx" ON "community_posts"("category_key");

-- CreateIndex
CREATE INDEX "community_posts_pinned_last_activity_at_idx" ON "community_posts"("pinned", "last_activity_at");

-- CreateIndex
CREATE UNIQUE INDEX "likes_user_id_comment_id_key" ON "likes"("user_id", "comment_id");

-- AddForeignKey
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_category_key_fkey" FOREIGN KEY ("category_key") REFERENCES "forum_categories"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_accepted_comment_id_fkey" FOREIGN KEY ("accepted_comment_id") REFERENCES "comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "likes" ADD CONSTRAINT "likes_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
