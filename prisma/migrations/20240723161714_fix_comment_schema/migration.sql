/*
  Warnings:

  - You are about to drop the column `userId` on the `article_comments` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "article_comments" DROP CONSTRAINT "article_comments_userId_fkey";

-- AlterTable
ALTER TABLE "article_comments" DROP COLUMN "userId";

-- AddForeignKey
ALTER TABLE "article_comments" ADD CONSTRAINT "article_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
