-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SiteStatus" ADD VALUE 'PUBLISHING';
ALTER TYPE "SiteStatus" ADD VALUE 'REPUBLISHING';
ALTER TYPE "SiteStatus" ADD VALUE 'FAILED';

-- AlterTable
ALTER TABLE "SiteVersion" ADD COLUMN     "publishedById" TEXT;

-- AddForeignKey
ALTER TABLE "SiteVersion" ADD CONSTRAINT "SiteVersion_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
