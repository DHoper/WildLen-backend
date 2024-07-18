/*
  Warnings:

  - You are about to drop the column `imageId` on the `articles` table. All the data in the column will be lost.
  - You are about to drop the column `subtitle` on the `articles` table. All the data in the column will be lost.
  - Added the required column `coverImage` to the `articles` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "articles" DROP CONSTRAINT "articles_imageId_fkey";

-- AlterTable
ALTER TABLE "articles" DROP COLUMN "imageId",
DROP COLUMN "subtitle",
ADD COLUMN     "coverImage" TEXT NOT NULL;
