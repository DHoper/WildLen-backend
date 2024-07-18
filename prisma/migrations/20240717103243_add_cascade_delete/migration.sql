-- DropForeignKey
ALTER TABLE "images" DROP CONSTRAINT "images_articleId_fkey";

-- DropForeignKey
ALTER TABLE "images" DROP CONSTRAINT "images_communityPostId_fkey";

-- DropForeignKey
ALTER TABLE "images" DROP CONSTRAINT "images_photoPostId_fkey";

-- AddForeignKey
ALTER TABLE "images" ADD CONSTRAINT "images_photoPostId_fkey" FOREIGN KEY ("photoPostId") REFERENCES "photo_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "images" ADD CONSTRAINT "images_communityPostId_fkey" FOREIGN KEY ("communityPostId") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "images" ADD CONSTRAINT "images_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
