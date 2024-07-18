/*
  Warnings:

  - You are about to drop the column `filename` on the `images` table. All the data in the column will be lost.
  - Added the required column `publicId` to the `images` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "article_comments" DROP CONSTRAINT "article_comments_authorId_fkey";

-- AlterTable
ALTER TABLE "article_comments" ADD COLUMN     "userId" INTEGER;

-- AlterTable
ALTER TABLE "images" DROP COLUMN "filename",
ADD COLUMN     "articleId" INTEGER,
ADD COLUMN     "publicId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "article_comments" ADD CONSTRAINT "article_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "images" ADD CONSTRAINT "images_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
