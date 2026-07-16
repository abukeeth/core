-- §Job Durability (Phase 1) — additive only; every column is DEFAULTed or
-- nullable so existing ImportJob/GenerationJob rows remain valid with no
-- backfill. The (status, heartbeatAt) indexes back the reaper's stale-job scan.

-- AlterTable
ALTER TABLE "ImportJob" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportJob" ADD COLUMN "startedAt" TIMESTAMP(3);
ALTER TABLE "ImportJob" ADD COLUMN "heartbeatAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "GenerationJob" ADD COLUMN "createdById" TEXT;
ALTER TABLE "GenerationJob" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "GenerationJob" ADD COLUMN "startedAt" TIMESTAMP(3);
ALTER TABLE "GenerationJob" ADD COLUMN "heartbeatAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ImportJob_status_heartbeatAt_idx" ON "ImportJob"("status", "heartbeatAt");

-- CreateIndex
CREATE INDEX "GenerationJob_status_heartbeatAt_idx" ON "GenerationJob"("status", "heartbeatAt");
