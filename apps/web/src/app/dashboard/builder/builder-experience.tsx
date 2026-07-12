"use client";

import { useEffect, useState, type ReactNode } from "react";
import { DashboardDrawer } from "@/components/dashboard-drawer";
import { FinaleReveal } from "./finale-reveal";
import { LiveBuildScreen } from "./live-build-screen";
import { useRestaurantBuilder } from "./use-restaurant-builder";

/** A brief cinematic beat between the last build step and the reveal — long enough to register, short enough to never feel like a stall. */
const REVEAL_DELAY_MS = 700;

/**
 * The orchestrated "AI Restaurant Builder" experience — see Sprint 11's
 * Product Experience Plan. Every visible stage maps to real backend work
 * (existing site-generation job stages, then auto-select/publish/QR
 * provisioning over existing endpoints); nothing here is a fake timer.
 */
export function BuilderExperience({ restaurantName }: { restaurantName: string }) {
  const state = useRestaurantBuilder();
  const [readyToReveal, setReadyToReveal] = useState(false);

  useEffect(() => {
    if (state.phase !== "done") return;
    const timer = setTimeout(() => setReadyToReveal(true), REVEAL_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state.phase]);

  let content: ReactNode;

  if (state.phase === "loading") {
    content = (
      <div className="flex min-h-screen w-full flex-col bg-[#F7F0E5] px-4 pt-5 sm:px-6">
        <DashboardDrawer />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
          <p className="text-sm text-[#756B5D]">Let&apos;s build {restaurantName}&apos;s digital home…</p>
        </div>
      </div>
    );
  } else if (state.phase === "bootstrap_failed") {
    content = (
      <div className="flex min-h-screen w-full flex-col bg-[#F7F0E5] px-4 pt-5 sm:px-6">
        <DashboardDrawer />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
          <p className="text-sm text-red-600">{state.bootstrapError ?? "Something went wrong getting started."}</p>
          <button
            type="button"
            onClick={state.retryBootstrap}
            className="rounded-full bg-[#171512] px-5 py-2 text-sm font-medium text-white"
          >
            Try again
          </button>
        </div>
      </div>
    );
  } else if (state.phase === "generating" || state.phase === "generation_failed") {
    const activeStepId = state.job?.stage ?? "INGEST";
    content = (
      <LiveBuildScreen
        restaurantName={restaurantName}
        activeStepId={activeStepId}
        errorMessage={state.phase === "generation_failed" ? (state.job?.error ?? "Generation failed") : null}
        onRetry={state.phase === "generation_failed" ? state.retryGeneration : undefined}
      />
    );
  } else if (state.phase === "finishing" || state.phase === "finish_failed" || (state.phase === "done" && !readyToReveal)) {
    const activeStepId = state.phase === "done" ? "PROVISIONING" : (state.finishFailure?.step ?? state.finishStepId);
    content = (
      <LiveBuildScreen
        restaurantName={restaurantName}
        activeStepId={activeStepId}
        errorMessage={state.finishFailure?.message ?? null}
        onRetry={state.phase === "finish_failed" ? state.retryFinish : undefined}
        captionContext={state.winningDesign ?? undefined}
        candidates={state.candidates}
        winnerId={state.winnerId}
        colorSeed={state.winningDesign?.colorSeed}
      />
    );
  } else {
    // phase === "done" && readyToReveal
    content = (
      <FinaleReveal
        restaurantName={restaurantName}
        siteId={state.siteId!}
        siteSlug={state.siteSlug ?? "your-restaurant"}
        publishedVersionId={state.publishedVersionId}
        qrToken={state.qrToken}
        qrError={state.qrError}
      />
    );
  }

  return content;
}
