"use client";

import { useEffect, useRef, useState } from "react";
import { getImportJob, rerunImportJob, type ImportJob } from "@/lib/api";
import { ProgressCard } from "../../dashboard/import/import-hub";
import { ReviewEditor } from "../../dashboard/import/[id]/review-editor";
import { primaryButtonClass, secondaryButtonClass } from "../wizard-shell";

const ACTIVE_STATUSES = new Set<ImportJob["status"]>(["PENDING", "PROCESSING"]);
const POLL_INTERVAL_MS = 4000;
// After this long still analyzing, offer a non-destructive retry (the backend
// reaper still owns terminal state) — same escape hatch as the legacy step.
const SLOW_AFTER_MS = 90_000;

/**
 * Onboarding V3 — Screen 2 (Analysis & Review). Polls the consolidated (MULTI)
 * import job created on Screen 1 to AWAITING_REVIEW, showing live progress, then
 * reuses the exact ReviewEditor the dashboard import flow uses so the owner
 * edits names/prices and approves BEFORE the storefront is built. Approving
 * saves the menu (approveImportJob) and hands off to the build screen.
 *
 * Never advances on the upload merely being accepted — only a real APPROVED job
 * (which itself requires at least one saved product) moves onboarding forward.
 */
export function AnalysisReviewScreen({
  initialJob,
  onApproved,
  onReset,
}: {
  initialJob: ImportJob;
  onApproved: () => void;
  onReset: () => void;
}) {
  const [job, setJob] = useState<ImportJob>(initialJob);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const pollRef = useRef<number | null>(null);

  // Real backend-state polling while the job is genuinely pending/processing.
  useEffect(() => {
    if (!ACTIVE_STATUSES.has(job.status)) return;
    const jobId = job.id;
    pollRef.current = window.setInterval(async () => {
      try {
        const { job: updated } = await getImportJob(jobId);
        setJob(updated);
      } catch {
        // A single missed poll tick isn't a failure — the next tick retries.
      }
    }, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
    // Keyed on id/status only: polling replaces `job` every tick even when
    // id/status are unchanged, and depending on the whole object would tear
    // down and rebuild the interval on every tick.
  }, [job.id, job.status]);

  // 1s tick while active so the "taking longer than expected" hatch appears
  // without waiting on the 4s poll.
  useEffect(() => {
    if (!ACTIVE_STATUSES.has(job.status)) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [job.id, job.status]);

  async function handleRetry() {
    setSubmitting(true);
    setError(null);
    try {
      const { job: retried } = await rerunImportJob(job.id);
      setJob(retried);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't retry the analysis");
    } finally {
      setSubmitting(false);
    }
  }

  if (ACTIVE_STATUSES.has(job.status)) {
    const slow = now - new Date(job.createdAt).getTime() > SLOW_AFTER_MS;
    return (
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">ANALYZING YOUR BUSINESS</p>
        <h1 className="mt-2 text-3xl font-display font-semibold tracking-tight">Reading your menu…</h1>
        <p className="mt-3 text-sm leading-6 text-ink-secondary">
          We&apos;re reading everything you shared and pulling it into one menu. This can take a minute — we&apos;ll keep you
          here until it&apos;s ready to review.
        </p>
        <div className="mt-6">
          <ProgressCard job={job} uploading={false} otherActiveCount={0} batchSummary={null} />
        </div>
        {slow && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm text-amber-800">This is taking longer than usual. You can keep waiting, or try again.</p>
            <button
              type="button"
              onClick={handleRetry}
              disabled={submitting}
              className="mt-3 min-h-11 rounded-xl border border-amber-300 bg-surface px-4 text-sm font-bold text-ink disabled:opacity-50"
            >
              {submitting ? "Retrying…" : "Try again"}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (job.status === "AWAITING_REVIEW") {
    return (
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">REVIEW YOUR MENU</p>
        <h1 className="mt-2 text-3xl font-display font-semibold tracking-tight">Here&apos;s what we found</h1>
        <p className="mt-3 text-sm leading-6 text-ink-secondary">
          Check names and prices, make quick edits, then approve to build your storefront.
        </p>
        {error && <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</p>}
        <div className="mt-6">
          <ReviewEditor job={job} onApproved={onApproved} onRejected={onReset} />
        </div>
      </div>
    );
  }

  if (job.status === "FAILED") {
    return (
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">ANALYZING YOUR BUSINESS</p>
        <h1 className="mt-2 text-3xl font-display font-semibold tracking-tight">We couldn&apos;t read your menu</h1>
        <p className="mt-3 rounded-2xl border border-danger/25 bg-danger/5 px-4 py-3 text-sm text-danger">
          {job.errorMessage ?? "Something went wrong while reading your sources."}
        </p>
        {error && <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</p>}
        <div className="mt-6 space-y-3">
          <button type="button" onClick={handleRetry} disabled={submitting} className={primaryButtonClass}>
            {submitting ? "Retrying…" : "Retry analysis"}
          </button>
          <button type="button" onClick={onReset} disabled={submitting} className={secondaryButtonClass}>
            Try different sources
          </button>
        </div>
      </div>
    );
  }

  // APPROVED / REJECTED reach here only transiently (e.g. a resumed job that
  // already advanced). Nudge the container to re-derive the correct screen.
  return (
    <div>
      <h1 className="text-2xl font-display font-semibold tracking-tight">Menu ready</h1>
      <p className="mt-3 text-sm leading-6 text-ink-secondary">Your menu is saved.</p>
      <button type="button" onClick={onApproved} className={`mt-6 ${primaryButtonClass}`}>
        Continue
      </button>
    </div>
  );
}
