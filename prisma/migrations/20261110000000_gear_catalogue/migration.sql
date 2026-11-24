-- CreateEnum
CREATE TYPE "GearType" AS ENUM ('CAMERA', 'LENS', 'TELECONVERTER');

-- CreateEnum
CREATE TYPE "PhotoLicense" AS ENUM ('ALL_RIGHTS_RESERVED', 'CC_BY', 'CC_BY_NC');

-- AlterTable
ALTER TABLE "photo_posts" ADD COLUMN     "camera_id" INTEGER,
ADD COLUMN     "captive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lens_id" INTEGER,
ADD COLUMN     "license" "PhotoLicense" NOT NULL DEFAULT 'ALL_RIGHTS_RESERVED';

-- CreateTable
CREATE TABLE "gear" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "GearType" NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "mount" TEXT NOT NULL,
    "focal_min_mm" INTEGER,
    "focal_max_mm" INTEGER,
    "aperture_wide" DOUBLE PRECISION,
    "aperture_tele" DOUBLE PRECISION,
    "magnification" DOUBLE PRECISION,
    "sensor" TEXT,
    "megapixels" DOUBLE PRECISION,
    "max_fps" DOUBLE PRECISION,
    "weight_g" INTEGER,
    "released_year" INTEGER,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gear_reviews" (
    "id" SERIAL NOT NULL,
    "gear_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "sharpness" INTEGER NOT NULL,
    "autofocus" INTEGER NOT NULL,
    "portability" INTEGER NOT NULL,
    "value" INTEGER NOT NULL,
    "use_cases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "comment" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gear_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_gear" (
    "user_id" INTEGER NOT NULL,
    "gear_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_gear_pkey" PRIMARY KEY ("user_id","gear_id")
);

-- CreateTable
CREATE TABLE "post_gear" (
    "post_id" INTEGER NOT NULL,
    "gear_id" INTEGER NOT NULL,

    CONSTRAINT "post_gear_pkey" PRIMARY KEY ("post_id","gear_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gear_slug_key" ON "gear"("slug");

-- CreateIndex
CREATE INDEX "gear_type_brand_idx" ON "gear"("type", "brand");

-- CreateIndex
CREATE UNIQUE INDEX "gear_reviews_gear_id_user_id_key" ON "gear_reviews"("gear_id", "user_id");

-- CreateIndex
CREATE INDEX "user_gear_gear_id_idx" ON "user_gear"("gear_id");

-- CreateIndex
CREATE INDEX "post_gear_gear_id_idx" ON "post_gear"("gear_id");

-- CreateIndex
CREATE INDEX "photo_posts_camera_id_idx" ON "photo_posts"("camera_id");

-- CreateIndex
CREATE INDEX "photo_posts_lens_id_idx" ON "photo_posts"("lens_id");

-- AddForeignKey
ALTER TABLE "photo_posts" ADD CONSTRAINT "photo_posts_camera_id_fkey" FOREIGN KEY ("camera_id") REFERENCES "gear"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_posts" ADD CONSTRAINT "photo_posts_lens_id_fkey" FOREIGN KEY ("lens_id") REFERENCES "gear"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gear_reviews" ADD CONSTRAINT "gear_reviews_gear_id_fkey" FOREIGN KEY ("gear_id") REFERENCES "gear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gear_reviews" ADD CONSTRAINT "gear_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_gear" ADD CONSTRAINT "user_gear_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_gear" ADD CONSTRAINT "user_gear_gear_id_fkey" FOREIGN KEY ("gear_id") REFERENCES "gear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_gear" ADD CONSTRAINT "post_gear_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_gear" ADD CONSTRAINT "post_gear_gear_id_fkey" FOREIGN KEY ("gear_id") REFERENCES "gear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

