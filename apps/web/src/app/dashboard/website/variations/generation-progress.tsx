"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getGenerationStatus, regenerateVariations, type GenerationJob } from "@/lib/api";

const POLL_INTERVAL_MS = 2500;

/**
 * Mirrors the real GenerationStage sequence and relative durations from
 * apps/api/prisma/schema.prisma / dashboard/builder/build-steps.ts, scoped
 * to just this flow's 8 stages (no select/publish/QR steps here) so 100%
 * lands exactly at FINALIZE instead of understating completion.
 */
const STAGES: { id: string; label: string; weight: number }[] = [
  { id: "INGEST", label: "Reading your menu and profile", weight: 6 },
  { id: "BRAND_ANALYSIS", label: "Analyzing your brand", weight: 10 },
  { id: "THEME_SELECTION", label: "Selecting themes for each style", weight: 4 },
  { id: "CONTENT_GENERATION", label: "Writing your content", weight: 14 },
  { id: "ASSEMBLY", label: "Assembling three designs", weight: 12 },
  { id: "ASSETS", label: "Preparing images", weight: 8 },
  { id: "SCORING", label: "Scoring each design", weight: 8 },
  { id: "FINALIZE", label: "Finishing up", weight: 4 },
];
const TOTAL_WEIGHT = STAGES.reduce((sum, stage) => sum + stage.weight, 0);

function stageIndex(id: string): number {
  return STAGES.findIndex((stage) => stage.id === id);
}

function overallPercent(activeId: string): number {
  const activeIdx = stageIndex(activeId);
  if (activeIdx === -1) return 0;
  const completed = STAGES.slice(0, activeIdx + 1).reduce((sum, stage) => sum + stage.weight, 0);
  return Math.round((completed / TOTAL_WEIGHT) * 100);
}

export function GenerationProgress({ siteId, initialJob }: { siteId: string; initialJob: GenerationJob }) {
  const router = useRouter();
  const [job, setJob] = useState(initialJob);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (job.status !== "PENDING" && job.status !== "RUNNING") return;

    const interval = setInterval(async () => {
      try {
        const { job: latest } = await getGenerationStatus(siteId);
        if (!latest) return;
        setJob(latest);
        if (latest.status === "COMPLETED") {
          router.refresh();
        }
      } catch {
        // Transient fetch failure — keep polling on the next tick.
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [job.status, router, siteId]);

  async function handleRetry() {
    setRetrying(true);
    try {
      const { job: newJob } = await regenerateVariations(siteId);
      setJob(newJob);
    } finally {
      setRetrying(false);
    }
  }

  if (job.status === "FAILED") {
    return (
      <div className="flex flex-col gap-3 rounded-3xl border border-[#E7DDCF] bg-white p-5 shadow-[0_12px_36px_rgba(48,39,27,0.04)] sm:p-6">
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Generation failed: {job.error ?? "Unknown error"}</p>
        <button
          type="button"
          onClick={handleRetry}
          disabled={retrying}
          className="min-h-12 self-start rounded-2xl bg-[#171512] px-5 text-sm font-bold text-white disabled:opacity-50"
        >
          {retrying ? "Retrying…" : "Try again"}
        </button>
      </div>
    );
  }

  const activeIdx = stageIndex(job.stage);
  const overall = overallPercent(job.stage);
  const activeStage = STAGES[activeIdx];

  return (
    <div className="rounded-3xl border border-[#E7DDCF] bg-white p-5 shadow-[0_12px_36px_rgba(48,39,27,0.04)] sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">GENERATING YOUR WEBSITE</p>
          <h2 className="mt-1 text-xl font-bold">Building three designs for you</h2>
        </div>
        <span className="text-2xl font-bold text-[#B97824]">{overall}%</span>
      </div>

      <div className="mt-4 h-3 overflow-hidden rounded-full bg-[#EEE5D9]">
        <div className="h-full rounded-full bg-[#B97824] transition-all duration-700" style={{ width: `${overall}%` }} />
      </div>

      <div className="mt-5 space-y-3">
        {STAGES.map((stage, index) => {
          const status = index < activeIdx ? "done" : index === activeIdx ? "active" : "upcoming";
          return (
            <div key={stage.id} className="flex items-center gap-3 text-sm">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  status === "done" ? "bg-emerald-600 text-white" : status === "active" ? "bg-[#B97824] text-white" : "bg-[#EEE5D9] text-[#A3988A]"
                }`}
              >
                {status === "done" ? "✓" : ""}
              </span>
              <span className={`font-semibold ${status === "upcoming" ? "text-[#A3988A]" : "text-[#2A251F]"}`}>{stage.label}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-6 rounded-2xl bg-[#171512] p-4 text-white">
        <p className="text-sm font-bold text-[#E1B56F]">Currently working…</p>
        <p className="mt-1 text-sm leading-6 text-[#E9E0D4]">{activeStage?.label ?? "Preparing your website"}…</p>
      </div>
    </div>
  );
}
