-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'KITCHEN_UNACCEPTED_ALERT';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "unacceptedAlertSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Order_status_confirmedAt_idx" ON "Order"("status", "confirmedAt");
