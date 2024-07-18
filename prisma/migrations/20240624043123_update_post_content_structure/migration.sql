/*
  Warnings:

  - You are about to drop the `article_contents` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `community_contents` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `content` to the `articles` table without a default value. This is not possible if the table is not empty.
  - Added the required column `content` to the `community_posts` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "article_contents" DROP CONSTRAINT "article_contents_articleId_fkey";

-- DropForeignKey
ALTER TABLE "community_contents" DROP CONSTRAINT "community_contents_postId_fkey";

-- AlterTable
ALTER TABLE "articles" ADD COLUMN     "content" JSONB NOT NULL;

-- AlterTable
ALTER TABLE "community_posts" ADD COLUMN     "content" JSONB NOT NULL;

-- DropTable
DROP TABLE "article_contents";

-- DropTable
DROP TABLE "community_contents";

-- DropEnum
DROP TYPE "ContentType";
