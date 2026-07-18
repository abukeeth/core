-- CreateTable
CREATE TABLE "OnboardingStatus" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "paymentSkippedAt" TIMESTAMP(3),
    "menuSkippedAt" TIMESTAMP(3),
    "websiteSkippedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingStatus_restaurantId_key" ON "OnboardingStatus"("restaurantId");

-- AddForeignKey
ALTER TABLE "OnboardingStatus" ADD CONSTRAINT "OnboardingStatus_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

