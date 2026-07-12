-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM ('RESTAURANT', 'COFFEE_SHOP', 'DELI', 'VAPE_SHOP', 'CONVENIENCE_STORE', 'BAKERY', 'PIZZA', 'RETAIL', 'OTHER');

-- CreateEnum
CREATE TYPE "SetupStep" AS ENUM ('BUSINESS_TYPE', 'BUSINESS_INFO', 'LOCATION', 'PAYMENT_PROVIDER', 'MENU_IMPORT', 'WEBSITE_THEME', 'DONE');

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN "businessType" "BusinessType" NOT NULL DEFAULT 'OTHER';
ALTER TABLE "Restaurant" ADD COLUMN "setupStep" "SetupStep" NOT NULL DEFAULT 'BUSINESS_TYPE';

-- Existing restaurants (created before this wizard existed) are already
-- fully set up — mark them DONE so they never get redirected into the
-- wizard on their next login.
UPDATE "Restaurant" SET "setupStep" = 'DONE';
