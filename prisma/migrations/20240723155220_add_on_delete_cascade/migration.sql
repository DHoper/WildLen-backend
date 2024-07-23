-- DropForeignKey
ALTER TABLE "article_comments" DROP CONSTRAINT "article_comments_userId_fkey";

-- AddForeignKey
ALTER TABLE "article_comments" ADD CONSTRAINT "article_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
