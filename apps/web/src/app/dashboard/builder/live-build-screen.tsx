"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardDrawer } from "@/components/dashboard-drawer";
import {
  BUILD_STEPS,
  overallProgressPercent,
  statusFor,
  type BuildCaptionContext,
} from "./build-steps";
import { DesignChoiceReveal } from "./design-choice-reveal";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";
import type { DesignCandidate } from "./use-restaurant-builder";
import { WebsiteMockup } from "./website-mockup";

const CAPTION_ROTATE_MS = 2200;

function RotatingCaption({ captions }: { captions: string[] }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (captions.length <= 1) return;
    const interval = setInterval(() => setIndex((i) => (i + 1) % captions.length), CAPTION_ROTATE_MS);
    return () => clearInterval(interval);
  }, [captions]);
  return <>{captions[index] ?? "Working on your business…"}</>;
}

function stageProgress(index: number, activeIndex: number, overall: number) {
  if (index < activeIndex) return 100;
  if (index > activeIndex) return 0;
  const bucket = 100 / Math.max(1, BUILD_STEPS.length);
  const start = index * bucket;
  return Math.max(8, Math.min(96, Math.round(((overall - start) / bucket) * 100)));
}

export function LiveBuildScreen({
  restaurantName,
  activeStepId,
  errorMessage,
  onRetry,
  captionContext,
  candidates,
  winnerId,
  colorSeed,
}: {
  restaurantName: string;
  activeStepId: string;
  errorMessage?: string | null;
  onRetry?: () => void;
  captionContext?: Partial<BuildCaptionContext>;
  candidates?: DesignCandidate[];
  winnerId?: string | null;
  colorSeed?: string | null;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const activeStep = BUILD_STEPS.find((step) => step.id === activeStepId);
  const overall = overallProgressPercent(activeStepId);
  const activeIndex = Math.max(0, BUILD_STEPS.findIndex((step) => step.id === activeStepId));
  const captions = activeStep?.captions({ restaurantName, ...captionContext }) ?? [];
  const showDesignChoice = activeStepId === "SELECTING" && candidates && candidates.length > 0;

  const stageCards = useMemo(() => {
    const grouped = new Map<string, typeof BUILD_STEPS>();
    for (const step of BUILD_STEPS) {
      const list = grouped.get(step.group) ?? [];
      grouped.set(step.group, [...list, step]);
    }
    return [...grouped.entries()];
  }, []);

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-[#F7F0E5] px-4 pb-28 pt-5 text-[#171512] sm:px-6 lg:px-10 lg:py-8">
      <DashboardDrawer />
      <div className="mx-auto w-full max-w-5xl">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">AI BUILDER</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Building {restaurantName}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#756B5D]">
              {errorMessage ? "We hit a snag — nothing was lost." : <RotatingCaption key={activeStepId} captions={captions} />}
            </p>
          </div>
          <div className="shrink-0 rounded-full bg-white px-3 py-2 text-sm font-bold text-[#B97824] shadow-sm">{overall}%</div>
        </header>

        <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-[#EDE3D6]">
          <div className="h-full rounded-full bg-[#B97824] transition-[width] duration-700" style={{ width: `${overall}%` }} />
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-[0.92fr_1.08fr]">
          <section className="space-y-3">
            {stageCards.map(([group, steps]) => {
              const firstIndex = BUILD_STEPS.findIndex((step) => step.id === steps[0]?.id);
              const lastIndex = BUILD_STEPS.findIndex((step) => step.id === steps[steps.length - 1]?.id);
              const groupDone = activeIndex > lastIndex;
              const groupActive = activeIndex >= firstIndex && activeIndex <= lastIndex;
              const groupProgress = groupDone ? 100 : groupActive ? Math.round(((activeIndex - firstIndex + 0.6) / Math.max(1, steps.length)) * 100) : 0;
              return (
                <article key={group} className="rounded-3xl border border-[#E7DDCF] bg-white p-4 shadow-[0_10px_30px_rgba(48,39,27,0.05)]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="font-bold">{group}</h2>
                      <p className="mt-1 text-xs text-[#756B5D]">{groupDone ? "Completed" : groupActive ? "In progress" : "Waiting"}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${groupDone ? "bg-emerald-50 text-emerald-700" : groupActive ? "bg-amber-50 text-amber-700" : "bg-[#F7F0E5] text-[#756B5D]"}`}>
                      {Math.min(100, groupProgress)}%
                    </span>
                  </div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#EEE5D9]">
                    <div className={`h-full rounded-full ${groupDone ? "bg-emerald-600" : "bg-[#B97824]"}`} style={{ width: `${Math.min(100, groupProgress)}%` }} />
                  </div>
                </article>
              );
            })}
          </section>

          <section className="space-y-4">
            <div className="rounded-3xl border border-[#E7DDCF] bg-white p-4 shadow-[0_12px_36px_rgba(48,39,27,0.06)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-bold">Your Website Preview</h2>
                  <p className="mt-1 text-xs text-[#756B5D]">Updates as AI builds your storefront.</p>
                </div>
                <span className="text-xs font-bold text-[#A9681F]">Live</span>
              </div>
              <div className="overflow-hidden rounded-2xl bg-[#171512] p-2">
                {showDesignChoice ? (
                  <DesignChoiceReveal candidates={candidates} winnerId={winnerId ?? null} reducedMotion={reducedMotion} />
                ) : (
                  <WebsiteMockup activeStepId={activeStepId} reducedMotion={reducedMotion} colorSeed={colorSeed} />
                )}
              </div>
            </div>

            <div className="rounded-3xl bg-[#171512] p-5 text-white shadow-xl shadow-black/10">
              <p className="text-sm font-bold text-[#E1B56F]">Currently working…</p>
              <p className="mt-2 text-sm leading-6 text-[#E9E0D4]">{activeStep?.title ?? "Preparing your business"}</p>
              <div className="mt-4 space-y-3">
                {BUILD_STEPS.slice(Math.max(0, activeIndex - 1), activeIndex + 3).map((step) => {
                  const index = BUILD_STEPS.findIndex((candidate) => candidate.id === step.id);
                  const value = stageProgress(index, activeIndex, overall);
                  const status = statusFor(step.id, activeStepId);
                  return (
                    <div key={step.id}>
                      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                        <span className={status === "upcoming" ? "text-white/45" : "text-white"}>{step.title}</span>
                        <span className="font-bold text-[#E1B56F]">{value}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div className={`h-full rounded-full ${status === "done" ? "bg-emerald-500" : "bg-[#D8A24E]"}`} style={{ width: `${value}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </div>

        {errorMessage && (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-center">
            <p className="text-sm text-red-700">{errorMessage}</p>
            {onRetry && <button type="button" onClick={onRetry} className="mt-3 rounded-2xl bg-[#171512] px-5 py-3 text-sm font-bold text-white">Try again</button>}
          </div>
        )}
      </div>
    </main>
  );
}
