-- Articles in the same translation group are versions of one another in different languages.
ALTER TABLE "articles" ADD COLUMN "translation_group" TEXT;
CREATE INDEX "articles_translation_group_idx" ON "articles"("translation_group");
