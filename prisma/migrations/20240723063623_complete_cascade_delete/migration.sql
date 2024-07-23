-- DropForeignKey
ALTER TABLE "user_votes" DROP CONSTRAINT "user_votes_userId_fkey";

-- DropForeignKey
ALTER TABLE "user_votes" DROP CONSTRAINT "user_votes_voteId_fkey";

-- DropForeignKey
ALTER TABLE "votes" DROP CONSTRAINT "votes_authorId_fkey";

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_votes" ADD CONSTRAINT "user_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_votes" ADD CONSTRAINT "user_votes_voteId_fkey" FOREIGN KEY ("voteId") REFERENCES "votes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
