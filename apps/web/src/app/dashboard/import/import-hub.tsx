"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createImportJob, type ImportJob, type ImportSourceType } from "@/lib/api";
import { SourceIcon, type ImportSourceId } from "./source-icons";

/**
 * Animates the container's height across content swaps (picker <-> live
 * progress <-> completion) instead of an abrupt jump — the picker is ~5x
 * taller than the progress card, so without this the page visibly snaps up
 * the moment an import starts.
 */
function AnimatedHeightSwap({ children }: { children: ReactNode }) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | "auto">("auto");

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setHeight(el.scrollHeight));
    observer.observe(el);
    setHeight(el.scrollHeight);
    return () => observer.disconnect();
  }, [children]);

  return (
    <div style={{ height, overflow: "hidden", transition: "height 380ms cubic-bezier(0.4, 0, 0.2, 1)" }}>
      <div ref={innerRef}>{children}</div>
    </div>
  );
}

interface SourceDef {
  id: ImportSourceId;
  label: string;
  sourceType: ImportSourceType | null;
  inputKind: "file" | "url" | "unavailable";
  accept?: string;
  tier?: "Enterprise";
}

const SOURCES: SourceDef[] = [
  { id: "image", label: "Photo", sourceType: "IMAGE", inputKind: "file", accept: "image/png,image/jpeg,image/webp,image/gif" },
  { id: "pdf", label: "PDF", sourceType: "PDF", inputKind: "file", accept: "application/pdf" },
  { id: "spreadsheet", label: "Spreadsheet", sourceType: "CSV", inputKind: "file", accept: ".csv,.xlsx,.xls,.json,text/csv,application/json,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  { id: "website", label: "Website", sourceType: "WEBSITE", inputKind: "url" },
  { id: "google_maps", label: "Google Maps", sourceType: "GOOGLE_MAPS", inputKind: "url" },
  { id: "doordash", label: "DoorDash", sourceType: null, inputKind: "unavailable" },
  { id: "uber_eats", label: "Uber Eats", sourceType: null, inputKind: "unavailable" },
  { id: "grubhub", label: "Grubhub", sourceType: null, inputKind: "unavailable" },
  { id: "toast", label: "Toast", sourceType: null, inputKind: "unavailable", tier: "Enterprise" },
  { id: "clover", label: "Clover", sourceType: null, inputKind: "unavailable", tier: "Enterprise" },
  { id: "square", label: "Square", sourceType: null, inputKind: "unavailable", tier: "Enterprise" },
  { id: "spoton", label: "SpotOn", sourceType: null, inputKind: "unavailable", tier: "Enterprise" },
  { id: "revel", label: "Revel", sourceType: null, inputKind: "unavailable", tier: "Enterprise" },
];

const MAX_IMAGE_FILES = 20;

const STAGES = ["Uploading", "OCR Reading", "AI Understanding", "Building Categories", "Building Products", "Generating Descriptions", "Saving Database", "Completed"] as const;

/** Ceiling this phase animates toward — never claims 100% until the job is truly AWAITING_REVIEW. */
function ceilingFor(status: ImportJob["status"] | "UPLOADING"): number {
  if (status === "UPLOADING") return 12;
  if (status === "PENDING") return 20;
  if (status === "PROCESSING") return 94;
  return 100;
}

function stageForPercent(percent: number): (typeof STAGES)[number] {
  if (percent < 12) return "Uploading";
  if (percent < 28) return "OCR Reading";
  if (percent < 44) return "AI Understanding";
  if (percent < 58) return "Building Categories";
  if (percent < 72) return "Building Products";
  if (percent < 85) return "Generating Descriptions";
  if (percent < 97) return "Saving Database";
  return "Completed";
}

/**
 * Smoothly animates toward a status-derived ceiling via interval ticks only
 * (never a direct setState in the effect body) — an honest "still working,
 * getting closer" indicator, not a fake precise countdown. Callers key the
 * enclosing component by job identity so a genuinely new job starts fresh
 * from 0 instead of inheriting a previous job's percent via React's normal
 * state-reset-on-remount behavior, rather than an effect-based reset.
 */
function useAnimatedPercent(status: ImportJob["status"] | "UPLOADING" | null) {
  const [percent, setPercent] = useState(0);
  useEffect(() => {
    if (!status) return;
    const ceiling = ceilingFor(status);
    const interval = window.setInterval(() => {
      setPercent((prev) => {
        const gap = ceiling - prev;
        if (Math.abs(gap) <= 0.5) return ceiling;
        return prev + gap * 0.25;
      });
    }, 250);
    return () => window.clearInterval(interval);
  }, [status]);
  return Math.round(percent);
}

function ProgressCard({
  job,
  uploading,
  otherActiveCount,
  batchSummary,
}: {
  job: ImportJob | null;
  uploading: boolean;
  otherActiveCount: number;
  batchSummary: { succeeded: number; failed: number } | null;
}) {
  const status: ImportJob["status"] | "UPLOADING" = uploading ? "UPLOADING" : (job?.status ?? "PENDING");
  const animatedPercent = useAnimatedPercent(status);
  const remainingSeconds = Math.max(2, Math.round(((100 - animatedPercent) / 100) * 45));
  const activeIdx = STAGES.indexOf(stageForPercent(animatedPercent));

  return (
    <section className="rounded-3xl border border-[#E7DDCF] bg-white p-5 shadow-[0_12px_36px_rgba(48,39,27,0.04)] sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">BUILDING YOUR MENU</p>
          <h2 className="mt-1 truncate text-xl font-bold sm:text-2xl">{stageForPercent(animatedPercent)}…</h2>
        </div>
        <span className="shrink-0 text-2xl font-bold text-[#B97824]">{animatedPercent}%</span>
      </div>

      <div className="mt-4 h-3 overflow-hidden rounded-full bg-[#EEE5D9]">
        <div className="h-full rounded-full bg-[#B97824] transition-all duration-500 ease-out" style={{ width: `${animatedPercent}%` }} />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {STAGES.map((stage, stageIdx) => (
            <span
              key={stage}
              className={`h-1.5 w-4 rounded-full transition-colors ${stageIdx <= activeIdx ? "bg-[#B97824]" : "bg-[#EEE5D9]"}`}
              aria-hidden="true"
            />
          ))}
        </div>
        <p className="shrink-0 text-xs font-semibold text-[#8A7D6C]">About {remainingSeconds}s left</p>
      </div>

      {otherActiveCount > 0 && (
        <p className="mt-4 text-xs text-[#8A7D6C]">{`${otherActiveCount} more photo${otherActiveCount === 1 ? "" : "s"} processing in the background.`}</p>
      )}

      {batchSummary && batchSummary.failed > 0 && (
        <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">
          {`${batchSummary.succeeded} photo${batchSummary.succeeded === 1 ? "" : "s"} started importing — ${batchSummary.failed} failed to upload and won't appear below.`}
        </p>
      )}
    </section>
  );
}

export function ImportHub({ activeJob, otherActiveCount }: { activeJob: ImportJob | null; otherActiveCount: number }) {
  const router = useRouter();
  const [localJob, setLocalJob] = useState<ImportJob | null>(null);
  const [openSourceId, setOpenSourceId] = useState<ImportSourceId | null>(null);
  const [urlValue, setUrlValue] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comingSoonNote, setComingSoonNote] = useState<string | null>(null);
  const [batchSummary, setBatchSummary] = useState<{ succeeded: number; failed: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const redirectedRef = useRef(false);
  const prevStatusRef = useRef<ImportJob["status"] | "UPLOADING" | null>(null);

  const displayJob = activeJob ?? localJob;

  useEffect(() => {
    if (!comingSoonNote) return;
    const timeout = window.setTimeout(() => setComingSoonNote(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [comingSoonNote]);

  /**
   * localJob is optimistic client state shown before the first server poll
   * confirms it. Once the server has had a full polling cycle to respond,
   * defer to it exclusively — otherwise a job that fails fast (before
   * appearing in `activeJob` at all) would leave this stuck showing fake
   * "still processing" forever, since `activeJob` going back to null can't
   * be told apart locally from "hasn't polled yet." If the job is really
   * still active, the next poll's `activeJob` prop supersedes localJob via
   * the `??` above before this fires, so nothing is lost.
   */
  useEffect(() => {
    if (!localJob) return;
    const timeout = window.setTimeout(() => setLocalJob(null), 7000);
    return () => window.clearTimeout(timeout);
  }, [localJob]);

  /**
   * Only auto-redirects on a genuine PENDING/PROCESSING -> AWAITING_REVIEW
   * transition witnessed while mounted — not merely "the active job happens
   * to already be AWAITING_REVIEW when this page loads." Without that
   * distinction, pressing Back to return here after a deliberate detour
   * (without approving/rejecting) would force-navigate the owner straight
   * back to the review page every time, on a loop.
   */
  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    const currentStatus = uploading ? "UPLOADING" : (displayJob?.status ?? null);
    prevStatusRef.current = currentStatus;

    const justCompleted = currentStatus === "AWAITING_REVIEW" && prevStatus !== null && prevStatus !== "AWAITING_REVIEW";
    if (!justCompleted || !displayJob || redirectedRef.current) return;
    redirectedRef.current = true;
    const timeout = window.setTimeout(() => router.push(`/dashboard/import/${displayJob.id}`), 2200);
    return () => window.clearTimeout(timeout);
  }, [displayJob, uploading, router]);

  function resetToPicker() {
    setLocalJob(null);
    redirectedRef.current = false;
    setOpenSourceId(null);
    setUrlValue("");
    setError(null);
    setBatchSummary(null);
  }

  async function submitFiles(source: SourceDef, files: File[]) {
    if (!source.sourceType || files.length === 0 || uploading) return;
    setError(null);
    setBatchSummary(null);
    setUploading(true);

    if (files.length === 1) {
      try {
        const { job } = await createImportJob(source.sourceType, { file: files[0] });
        setLocalJob(job);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Import failed");
      } finally {
        setUploading(false);
      }
      return;
    }

    let succeeded = 0;
    let failed = 0;
    let firstJob: ImportJob | null = null;
    for (let i = 0; i < files.length; i++) {
      setUploadProgress({ done: i, total: files.length });
      try {
        const { job } = await createImportJob(source.sourceType, { file: files[i] });
        if (!firstJob) firstJob = job;
        succeeded++;
      } catch {
        // Individual photo failures don't stop the batch — counted below and surfaced via Import History.
        failed++;
      }
    }
    setUploadProgress(null);
    setUploading(false);
    if (succeeded === 0) {
      setError("None of the selected photos could be uploaded. Try again.");
      return;
    }
    if (failed > 0) setBatchSummary({ succeeded, failed });
    setLocalJob(firstJob);
    router.refresh();
  }

  async function submitUrl(source: SourceDef) {
    if (!source.sourceType || !urlValue.trim() || uploading) return;
    setError(null);
    setUploading(true);
    try {
      const { job } = await createImportJob(source.sourceType, { url: urlValue.trim() });
      setLocalJob(job);
      setUrlValue("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setUploading(false);
    }
  }

  function handleTileTap(source: SourceDef) {
    setError(null);
    if (source.inputKind === "unavailable") {
      setComingSoonNote(`${source.label} import is coming soon${source.tier ? ` (${source.tier})` : ""}.`);
      return;
    }
    if (source.inputKind === "file") {
      setOpenSourceId(source.id);
      // Deferred so the input (freshly re-rendered for this source's accept/multiple attrs) is mounted before we click it.
      requestAnimationFrame(() => fileInputRef.current?.click());
      return;
    }
    setOpenSourceId((current) => (current === source.id ? null : source.id));
  }

  const openSource = SOURCES.find((s) => s.id === openSourceId) ?? null;

  let content: ReactNode;

  // ---- Live progress card (replaces the picker in place) ----
  if (displayJob && (displayJob.status === "PENDING" || displayJob.status === "PROCESSING" || uploading)) {
    content = (
      <ProgressCard key={displayJob?.id ?? "uploading"} job={displayJob} uploading={uploading} otherActiveCount={otherActiveCount} batchSummary={batchSummary} />
    );
  } else if (displayJob?.status === "AWAITING_REVIEW") {
    const categoryCount = displayJob.extractedData?.categories.length ?? 0;
    const productCount = displayJob.extractedData?.categories.reduce((sum, c) => sum + c.items.length, 0) ?? 0;
    content = (
      <section className="rounded-3xl border border-[#E7DDCF] bg-white p-5 text-center shadow-[0_12px_36px_rgba(48,39,27,0.04)] sm:p-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-3xl">✅</div>
        <h2 className="mt-4 text-2xl font-bold">Menu Ready</h2>
        <p className="mt-2 text-sm text-[#756B5D]">
          {`${productCount} product${productCount === 1 ? "" : "s"} across ${categoryCount} categor${categoryCount === 1 ? "y" : "ies"}.`}
        </p>
        <Link
          href={`/dashboard/import/${displayJob.id}`}
          className="mt-6 inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-[#171512] px-6 text-base font-bold text-white shadow-lg shadow-black/10 active:scale-[0.99] sm:w-auto"
        >
          Review Menu
        </Link>
      </section>
    );
  } else {
    // ---- Source picker ----
    content = (
    <section className="rounded-3xl border border-[#E7DDCF] bg-white p-5 shadow-[0_12px_36px_rgba(48,39,27,0.04)] sm:p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F4E6D1] text-2xl font-bold text-[#9A5F17]">＋</div>
        <div className="min-w-0">
          <h2 className="text-xl font-bold">Import your menu</h2>
          <p className="mt-1 text-sm leading-6 text-[#756B5D]">Tap a source — your import starts right away.</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-3">
        {SOURCES.map((source) => (
          <button
            key={source.id}
            type="button"
            onClick={() => handleTileTap(source)}
            className={`flex min-h-[84px] flex-col items-center justify-center gap-2 rounded-2xl border p-2 text-center transition active:scale-[0.97] ${
              openSourceId === source.id ? "border-[#B97824] bg-[#FFF8ED] shadow-[0_8px_24px_rgba(185,120,36,0.10)]" : "border-[#E7DDCF] bg-[#FFFDF9]"
            } ${source.inputKind === "unavailable" ? "opacity-90" : ""}`}
          >
            <SourceIcon id={source.id} className="h-9 w-9" />
            <span className="text-[11px] font-bold leading-tight text-[#171512]">{source.label}</span>
            {source.inputKind === "unavailable" && (
              <span className="rounded-full bg-[#F7F0E5] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#8A7D6C]">
                {source.tier ?? "Soon"}
              </span>
            )}
          </button>
        ))}
      </div>

      {comingSoonNote && (
        <p className="mt-4 rounded-2xl bg-[#F7F0E5] px-4 py-3 text-sm font-semibold text-[#756B5D]">{comingSoonNote}</p>
      )}

      {openSource?.inputKind === "url" && (
        <div className="mt-4">
          <div className="flex items-center gap-2 rounded-2xl border border-[#E7DDCF] bg-white px-4 focus-within:border-[#B97824]">
            <input
              type="text"
              autoFocus
              value={urlValue}
              onChange={(e) => setUrlValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitUrl(openSource);
              }}
              placeholder={openSource.id === "google_maps" ? "https://maps.app.goo.gl/..." : "https://example.com/menu"}
              className="min-h-14 w-full bg-transparent text-base text-[#171512] outline-none placeholder:text-[#A3988A]"
            />
            <button
              type="button"
              onClick={() => submitUrl(openSource)}
              disabled={!urlValue.trim() || uploading}
              aria-label={`Import from ${openSource.label}`}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#171512] text-white disabled:opacity-30"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M14 7l5 5-5 5" />
              </svg>
            </button>
          </div>
          <p className="mt-2 text-xs text-[#8A7D6C]">Press Enter or tap the arrow to start.</p>
        </div>
      )}

      {openSource?.inputKind === "file" && (
        <input
          ref={fileInputRef}
          type="file"
          accept={openSource.accept}
          multiple={openSource.id === "image"}
          className="sr-only"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []).slice(0, openSource.id === "image" ? MAX_IMAGE_FILES : 1);
            e.target.value = "";
            if (files.length > 0) submitFiles(openSource, files);
            else setOpenSourceId(null);
          }}
        />
      )}

      {uploadProgress && (
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-[#EEE5D9]">
            <div className="h-full rounded-full bg-[#B97824] transition-all duration-300" style={{ width: `${Math.round((uploadProgress.done / uploadProgress.total) * 100)}%` }} />
          </div>
          <p className="mt-2 text-xs font-semibold text-[#9A6A2F]">{`Uploading photo ${uploadProgress.done + 1} of ${uploadProgress.total}…`}</p>
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button type="button" onClick={resetToPicker} className="shrink-0 font-bold underline">Try again</button>
        </div>
      )}
    </section>
    );
  }

  return <AnimatedHeightSwap>{content}</AnimatedHeightSwap>;
}
