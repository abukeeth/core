-- Launch sprint — SaaS Billing MVP.

CREATE TYPE "PlatformPlan" AS ENUM ('STARTER');

CREATE TYPE "PlatformSubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED');

CREATE TABLE "PlatformSubscription" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "plan" "PlatformPlan" NOT NULL DEFAULT 'STARTER',
    "status" "PlatformSubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "trialEndsAt" TIMESTAMP(3) NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformSubscription_restaurantId_key" ON "PlatformSubscription"("restaurantId");
CREATE UNIQUE INDEX "PlatformSubscription_stripeCustomerId_key" ON "PlatformSubscription"("stripeCustomerId");
CREATE UNIQUE INDEX "PlatformSubscription_stripeSubscriptionId_key" ON "PlatformSubscription"("stripeSubscriptionId");
CREATE INDEX "PlatformSubscription_status_idx" ON "PlatformSubscription"("status");

ALTER TABLE "PlatformSubscription" ADD CONSTRAINT "PlatformSubscription_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing Business starts a fresh 14-day trial from the
-- moment billing ships (not from its createdAt — pre-billing businesses
-- were never told a clock was running).
INSERT INTO "PlatformSubscription" ("id", "restaurantId", "trialEndsAt", "updatedAt")
SELECT gen_random_uuid(), r."id", CURRENT_TIMESTAMP + interval '14 days', CURRENT_TIMESTAMP
FROM "Restaurant" r
ON CONFLICT ("restaurantId") DO NOTHING;
