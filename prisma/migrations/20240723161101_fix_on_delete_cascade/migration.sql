/*
  Warnings:

  - Made the column `userId` on table `article_comments` required. This step will fail if there are existing NULL values in that column.
  - Made the column `voteId` on table `user_votes` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "article_comments" ALTER COLUMN "userId" SET NOT NULL;

-- AlterTable
ALTER TABLE "user_votes" ALTER COLUMN "voteId" SET NOT NULL;
