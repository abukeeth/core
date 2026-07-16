"use client";

import { useEffect, useRef, useState } from "react";
import {
  createImportJob,
  getImportJob,
  listImportJobs,
  rerunImportJob,
  setSetupStep,
  type ImportJob,
  type Restaurant,
} from "@/lib/api";
import { ReviewEditor } from "../../dashboard/import/[id]/review-editor";
import { ProgressCard } from "../../dashboard/import/import-hub";
import { primaryButtonClass, secondaryButtonClass } from "../wizard-shell";

const ACTIVE_STATUSES = new Set<ImportJob["status"]>(["PENDING", "PROCESSING"]);
const RESUMABLE_STATUSES = new Set<ImportJob["status"]>(["PENDING", "PROCESSING", "AWAITING_REVIEW"]);
const POLL_INTERVAL_MS = 4000;
// §Job Durability — after this long still importing, offer a non-destructive
// retry (the backend reaper still owns terminal state).
const SLOW_AFTER_MS = 90_000;

/**
 * §K/§15 — the setup wizard must never advance past menu import before the
 * upload finishes, OCR/extraction finishes, validation finishes, extracted
 * products are actually saved, and the owner explicitly approves. Unlike
 * the previous version of this component, `advance()` is now reachable
 * ONLY from `handleApproved` (a real ImportJob reaching APPROVED, which
 * itself requires at least one saved product — see approveJob's
 * ImportJobEmptyMenuError guard) or from an explicit "Skip for now" click —
 * never from the upload request merely being *accepted* (202).
 */
export function MenuImportStep({ onDone }: { onDone: (restaurant: Restaurant) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [resuming, setResuming] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const pollRef = useRef<number | null>(null);

  // Resumability: a refresh or reopening the dashboard mid-import must not
  // silently drop back to an empty picker while a real job is still
  // in-flight (or already awaiting review) on the server.
  useEffect(() => {
    let cancelled = false;
    listImportJobs()
      .then(async ({ jobs }) => {
        if (cancelled) return;
        const resumable = jobs.find((candidate) => RESUMABLE_STATUSES.has(candidate.status));
        if (resumable) {
          setJob(resumable);
          return;
        }
        // Priority 3: reaching this step (MenuImportStep only renders while
        // setupStep === MENU_IMPORT) with an already-APPROVED job means the
        // menu was extracted, saved, and approved, but the wizard's advance
        // to WEBSITE_THEME never landed — e.g. the setSetupStep call right
        // after approval failed, or the tab closed between the two. The menu
        // is already built, so continue automatically instead of forcing the
        // owner to re-import or manually skip.
        const approved = jobs.find((candidate) => candidate.status === "APPROVED");
        if (approved) {
          const { restaurant } = await setSetupStep("WEBSITE_THEME");
          if (!cancelled) onDone(restaurant);
        }
      })
      .catch(() => {
        // No existing job reachable — falls through to the picker, same as a genuinely fresh start.
      })
      .finally(() => {
        if (!cancelled) setResuming(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onDone]);

  // Real backend-state polling while a job is genuinely pending/processing —
  // never a client-side timer that advances regardless of actual status.
  useEffect(() => {
    if (!job || !ACTIVE_STATUSES.has(job.status)) return;
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
    // Deliberately keyed on job?.id/job?.status only, not the whole `job`
    // object: polling replaces `job` with a new object every tick even when
    // id/status haven't changed, and depending on the full object would
    // tear down and rebuild the interval on every single tick instead of
    // only when the job actually transitions to a different id/status.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, job?.status]);

  // §Job Durability — 1s tick while a job is active so the "taking longer
  // than expected" escape hatch appears without waiting on the 4s poll.
  useEffect(() => {
    if (!job || !ACTIVE_STATUSES.has(job.status)) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
    // Keyed on id/status only (same reasoning as the polling effect above):
    // the tick shouldn't restart on every polled `job` object replacement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, job?.status]);

  async function handleImport() {
    if (!file) return;
    setSubmitting(true);
    setError(null);
    try {
      const sourceType = file.type === "application/pdf" ? "PDF" : "IMAGE";
      const { job: created } = await createImportJob(sourceType, { file });
      setJob(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSkip() {
    setSubmitting(true);
    setError(null);
    try {
      const { restaurant } = await setSetupStep("WEBSITE_THEME");
      onDone(restaurant);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  async function handleApproved() {
    setError(null);
    try {
      const { restaurant } = await setSetupStep("WEBSITE_THEME");
      onDone(restaurant);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  function handleRejected() {
    setJob(null);
    setFile(null);
  }

  async function handleRetry() {
    if (!job) return;
    setSubmitting(true);
    setError(null);
    try {
      const { job: retried } = await rerunImportJob(job.id);
      setJob(retried);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't retry the import");
    } finally {
      setSubmitting(false);
    }
  }

  function resetToPicker() {
    setJob(null);
    setFile(null);
    setError(null);
  }

  if (resuming) {
    return <p className="text-sm text-[#756B5D]">Checking for an in-progress import…</p>;
  }

  if (job && ACTIVE_STATUSES.has(job.status)) {
    const slow = now - new Date(job.createdAt).getTime() > SLOW_AFTER_MS;
    return (
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">BUILD YOUR MENU</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Building your menu…</h1>
        <p className="mt-3 text-sm leading-6 text-[#756B5D]">
          This can take a minute — we&apos;ll keep you here until it&apos;s ready to review.
        </p>
        <div className="mt-6">
          <ProgressCard job={job} uploading={false} otherActiveCount={0} batchSummary={null} />
        </div>
        {slow && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm text-amber-800">This is taking longer than usual. You can keep waiting, or try again.</p>
            <button type="button" onClick={handleRetry} disabled={submitting} className="mt-3 min-h-11 rounded-xl border border-amber-300 bg-white px-4 text-sm font-bold text-[#171512] disabled:opacity-50">
              {submitting ? "Retrying…" : "Try again"}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (job && job.status === "AWAITING_REVIEW") {
    return (
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">BUILD YOUR MENU</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Review your imported menu</h1>
        <p className="mt-3 text-sm leading-6 text-[#756B5D]">
          Check names and prices, make quick edits, then approve to continue.
        </p>
        {error && <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</p>}
        <div className="mt-6">
          <ReviewEditor job={job} onApproved={handleApproved} onRejected={handleRejected} />
        </div>
      </div>
    );
  }

  if (job && job.status === "FAILED") {
    return (
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">BUILD YOUR MENU</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Import failed</h1>
        <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {job.errorMessage ?? "Something went wrong while reading your menu."}
        </p>
        <div className="mt-6 space-y-3">
          <button type="button" onClick={handleRetry} disabled={submitting} className={primaryButtonClass}>
            {submitting ? "Retrying…" : "Retry import"}
          </button>
          <button type="button" onClick={resetToPicker} disabled={submitting} className={secondaryButtonClass}>
            Try a different file
          </button>
          <button type="button" onClick={handleSkip} disabled={submitting} className={secondaryButtonClass}>
            Skip for now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">BUILD YOUR MENU</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Import your menu</h1>
      <p className="mt-3 text-sm leading-6 text-[#756B5D]">
        Upload a photo or PDF of your menu and AI will build it for you, or skip and add items manually later.
      </p>

      <div className="mt-6 space-y-4">
        {error && <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</p>}

        <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#E7DDCF] bg-[#FBF7F1] px-4 text-center text-sm font-semibold text-[#756B5D]">
          <input
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file ? file.name : "Tap to choose a menu photo or PDF"}
        </label>

        <button type="button" onClick={handleImport} disabled={submitting || !file} className={primaryButtonClass}>
          {submitting ? "Uploading…" : "Import menu"}
        </button>
        <button type="button" onClick={handleSkip} disabled={submitting} className={secondaryButtonClass}>
          Skip for now
        </button>
      </div>
    </div>
  );
}
