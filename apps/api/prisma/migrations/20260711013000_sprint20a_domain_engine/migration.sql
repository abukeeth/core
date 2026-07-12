-- CreateEnum
CREATE TYPE "DomainEventType" AS ENUM ('CREATED', 'VERIFIED', 'VERIFICATION_FAILED', 'SSL_GENERATING', 'SSL_ACTIVE', 'SSL_FAILED', 'PRIMARY_CHANGED', 'DISCONNECTED');

-- AlterEnum
-- DomainTlsStatus gains GENERATING/ACTIVE/EXPIRED and drops the old ISSUED
-- value. Any existing ISSUED rows are backfilled to PENDING (a certificate
-- will be re-issued on the next successful verification) before the type
-- swap, since ISSUED has no equivalent in the new enum and Postgres can't
-- cast a text value into an enum member that doesn't exist.
BEGIN;
UPDATE "Domain" SET "tlsStatus" = 'PENDING' WHERE "tlsStatus"::text = 'ISSUED';
CREATE TYPE "DomainTlsStatus_new" AS ENUM ('PENDING', 'GENERATING', 'ACTIVE', 'EXPIRED', 'FAILED');
ALTER TABLE "public"."Domain" ALTER COLUMN "tlsStatus" DROP DEFAULT;
ALTER TABLE "Domain" ALTER COLUMN "tlsStatus" TYPE "DomainTlsStatus_new" USING ("tlsStatus"::text::"DomainTlsStatus_new");
ALTER TYPE "DomainTlsStatus" RENAME TO "DomainTlsStatus_old";
ALTER TYPE "DomainTlsStatus_new" RENAME TO "DomainTlsStatus";
DROP TYPE "public"."DomainTlsStatus_old";
ALTER TABLE "Domain" ALTER COLUMN "tlsStatus" SET DEFAULT 'PENDING';
COMMIT;

-- AlterTable
-- verificationToken gets a temporary DB-level default so existing rows are
-- backfilled with their own random token during the rewrite; the default is
-- dropped immediately after so future inserts rely on Prisma Client's
-- @default(uuid()) instead of a permanent DB-level default.
ALTER TABLE "Domain" ADD COLUMN     "lastCheckedAt" TIMESTAMP(3),
ADD COLUMN     "tlsExpiresAt" TIMESTAMP(3),
ADD COLUMN     "verificationToken" TEXT NOT NULL DEFAULT gen_random_uuid()::text;
ALTER TABLE "Domain" ALTER COLUMN "verificationToken" DROP DEFAULT;

-- CreateTable
CREATE TABLE "DomainEvent" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "domainId" TEXT,
    "hostname" TEXT NOT NULL,
    "type" "DomainEventType" NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DomainEvent_siteId_idx" ON "DomainEvent"("siteId");

-- CreateIndex
CREATE INDEX "DomainEvent_domainId_idx" ON "DomainEvent"("domainId");

-- AddForeignKey
ALTER TABLE "DomainEvent" ADD CONSTRAINT "DomainEvent_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainEvent" ADD CONSTRAINT "DomainEvent_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE SET NULL ON UPDATE CASCADE;
