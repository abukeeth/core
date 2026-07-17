"use client";

import { useEffect, useState, type ReactNode } from "react";
import { DashboardDrawer } from "@/components/dashboard-drawer";
import { DesignReviewScreen } from "./design-review-screen";
import { FinaleReveal } from "./finale-reveal";
import { LiveBuildScreen } from "./live-build-screen";
import { useRestaurantBuilder } from "./use-restaurant-builder";

/** A brief cinematic beat between confirmed publish and the reveal — long enough to register, short enough to never feel like a stall. */
const REVEAL_DELAY_MS = 700;

/**
 * The AI Restaurant Builder experience. The pipeline runs real backend work
 * (generation → auto-select a previewable draft), then STOPS at a real
 * preview + approval gate (DesignReviewScreen). Publishing and the success
 * reveal happen only after the owner approves and the backend confirms
 * publish — never automatically. See
 * docs/audits/AI_BUILDER_APPROVAL_FIX_IMPLEMENTATION.md.
 */
export function BuilderExperience({ restaurantName }: { restaurantName: string }) {
  const state = useRestaurantBuilder();
  const [readyToReveal, setReadyToReveal] = useState(false);

  // Only start the reveal beat once publish is actually confirmed (done).
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
    content = (
      <LiveBuildScreen
        restaurantName={restaurantName}
        activeStepId={state.job?.stage ?? "INGEST"}
        errorMessage={state.phase === "generation_failed" ? (state.job?.error ?? "Generation failed") : null}
        onRetry={state.phase === "generation_failed" ? state.retryGeneration : undefined}
      />
    );
  } else if (state.phase === "selecting" || state.phase === "select_failed") {
    // Brief auto-select of a previewable design — reuses the build screen's
    // "SELECTING" step. A failure here retries selection only.
    content = (
      <LiveBuildScreen
        restaurantName={restaurantName}
        activeStepId="SELECTING"
        errorMessage={state.phase === "select_failed" ? (state.actionError ?? "Couldn't prepare your design") : null}
        onRetry={state.phase === "select_failed" ? state.retrySelect : undefined}
        captionContext={state.winningDesign ?? undefined}
        candidates={state.candidates}
        winnerId={state.selectedVersionId}
        colorSeed={state.winningDesign?.colorSeed}
      />
    );
  } else if (
    state.phase === "review" ||
    state.phase === "approving" ||
    state.phase === "approve_failed" ||
    state.phase === "publishing" ||
    state.phase === "publish_failed"
  ) {
    // The approval gate — real preview + explicit approve before publish.
    content = (
      <DesignReviewScreen
        restaurantName={restaurantName}
        siteId={state.siteId!}
        selectedVersionId={state.selectedVersionId}
        phase={state.phase}
        actionError={state.actionError}
        onApprove={state.approveDesign}
        onRetryApprove={state.retryApprove}
        onRetryPublish={state.retryPublish}
      />
    );
  } else if (state.phase === "done" && !readyToReveal) {
    // Publish is confirmed; brief beat before the celebratory reveal. No
    // confetti or "you're live" copy here — that lives in FinaleReveal.
    content = (
      <div className="flex min-h-screen w-full flex-col bg-[#F7F0E5] px-4 pt-5 sm:px-6">
        <DashboardDrawer />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-[#E7DDCF] border-t-[#B97824]" aria-hidden="true" />
          <p className="text-sm text-[#756B5D]">Your website is published — putting the finishing touches on it…</p>
        </div>
      </div>
    );
  } else {
    // phase === "done" && readyToReveal
    content = (
      <FinaleReveal
        restaurantName={restaurantName}
        siteId={state.siteId!}
        siteSlug={state.siteSlug ?? "your-restaurant"}
        siteDomain={state.siteDomain}
        publishedVersionId={state.publishedVersionId}
        qrToken={state.qrToken}
        qrError={state.qrError}
      />
    );
  }

  return content;
}
