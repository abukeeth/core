import { ImportStatus } from "@prisma/client";
import { waitUntil } from "@vercel/functions";
import { withHeartbeat } from "../../lib/job-durability";
import { prisma } from "../../lib/prisma";
import { importAdapterRegistry } from "./adapters/registry";
import type { ImportSourceInput } from "./types";

export interface ImportJobRunner {
  enqueue(jobId: string, input: ImportSourceInput): void;
}

/**
 * MVP implementation: fires the adapter's extract() call in-process
 * without blocking the HTTP response. This interface is the seam for
 * swapping in a real queue (BullMQ/SQS) later without touching the
 * controller or service.
 *
 * `waitUntil` (not a bare `void`) because Vercel's serverless runtime can
 * freeze a function's execution shortly after its HTTP response is sent —
 * a detached promise with no `waitUntil` registration can be paused
 * mid-extraction and never resume, leaving the job stuck at PROCESSING
 * forever. `waitUntil` extends the invocation's lifetime until the
 * promise settles. Off Vercel (Docker/Render/local/tests), it's a no-op
 * passthrough (see @vercel/functions' getContext()), so this run()
 * already started executing the moment it was called either way —
 * identical behavior to the previous `void this.run(...)`.
 */
class InProcessImportJobRunner implements ImportJobRunner {
  enqueue(jobId: string, input: ImportSourceInput): void {
    waitUntil(this.run(jobId, input));
  }

  private async run(jobId: string, input: ImportSourceInput): Promise<void> {
    // §Job Durability — atomic claim: only a still-PENDING job can be
    // started, and only once. If another worker or a reaper re-enqueue
    // already claimed it, updateMany reports 0 rows and we abort — this
    // makes enqueue() idempotent and safe for the reaper to call again.
    // attempts is incremented here (a real processing start), and
    // startedAt/heartbeatAt mark the job live for the reaper.
    const now = new Date();
    const claim = await prisma.importJob.updateMany({
      where: { id: jobId, status: ImportStatus.PENDING },
      data: { status: ImportStatus.PROCESSING, startedAt: now, heartbeatAt: now, attempts: { increment: 1 } },
    });
    if (claim.count === 0) return;

    try {
      const job = await prisma.importJob.findUniqueOrThrow({ where: { id: jobId } });
      const adapter = importAdapterRegistry.get(job.sourceType);
      if (!adapter) {
        throw new Error(`No adapter registered for source type ${job.sourceType}`);
      }

      const extractedData = await withHeartbeat(
        () => prisma.importJob.update({ where: { id: jobId }, data: { heartbeatAt: new Date() } }).then(() => undefined),
        () => adapter.extract(input),
      );

      await prisma.importJob.update({
        where: { id: jobId },
        data: { status: ImportStatus.AWAITING_REVIEW, extractedData, heartbeatAt: null },
      });
    } catch (err) {
      await prisma.importJob
        .update({
          where: { id: jobId },
          data: {
            status: ImportStatus.FAILED,
            errorMessage: err instanceof Error ? err.message : "Import failed",
            heartbeatAt: null,
          },
        })
        .catch(() => undefined);
    }
  }
}

export const importJobRunner: ImportJobRunner = new InProcessImportJobRunner();
