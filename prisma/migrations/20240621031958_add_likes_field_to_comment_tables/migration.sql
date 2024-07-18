-- AlterTable
ALTER TABLE "article_comments" ADD COLUMN     "likes" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "comments" ADD COLUMN     "likes" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "community_comments" ADD COLUMN     "likes" INTEGER NOT NULL DEFAULT 0;
