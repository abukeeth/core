-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN "referralCode" TEXT;
ALTER TABLE "Restaurant" ADD COLUMN "referredById" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Restaurant_referralCode_key" ON "Restaurant"("referralCode");

-- AddForeignKey
ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
