-- AlterTable
ALTER TABLE "species" ADD COLUMN     "family_names" JSONB,
ADD COLUMN     "identification" JSONB,
ADD COLUMN     "inat_taxon_id" INTEGER,
ADD COLUMN     "order_names" JSONB,
ADD COLUMN     "similar_species_ids" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "taxon_family" TEXT,
ADD COLUMN     "taxon_order" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avatar_url" TEXT,
ADD COLUMN     "home_area" TEXT,
ADD COLUMN     "specialties" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE UNIQUE INDEX "species_inat_taxon_id_key" ON "species"("inat_taxon_id");

-- CreateIndex
CREATE INDEX "species_taxon_family_idx" ON "species"("taxon_family");

