-- AlterEnum
ALTER TYPE "ImportSourceType" ADD VALUE 'CSV';

-- AlterTable
ALTER TABLE "ImportJob" ADD COLUMN     "sourceMimeType" TEXT;
