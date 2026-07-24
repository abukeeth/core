"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getRestaurant,
  isApiRequestError,
  listImportJobs,
  setSetupStep,
  type ImportJob,
  type Restaurant,
} from "@/lib/api";
import { V3Shell, type V3Stage } from "./v3-shell";
import { CreateBusinessScreen } from "./create-business-screen";
import { AnalysisReviewScreen } from "./analysis-review-screen";

// The builder page IS the "Live Build + Ready" experience (generate → review →
// publish → finale with the live link + QR). V3 reuses it wholesale rather than
// re-implementing a third screen, exactly as the legacy wizard's final step does.
const BUILD_ROUTE = "/dashboard/builder";

// Import statuses that mean "the review screen still owns this job".
const RESUMABLE_REVIEW = new Set<ImportJob["status"]>(["PENDING", "PROCESSING", "AWAITING_REVIEW"]);

type LoadState = "loading" | "error" | "ready";

/**
 * Onboarding V3 orchestrator — the 3-stage store-creation flow behind the
 * `NEXT_PUBLIC_ONBOARDING_V3` flag. Stages: Create (type + sources) → Review
 * (analyze + edit + approve the menu) → Build (hand off to the builder).
 *
 * Resume is DATA-DRIVEN, not a replay: on load it re-derives the correct stage
 * from the real store + import-job state, so a refresh mid-analysis returns to
 * review, and a store whose menu is already approved goes straight to build.
 * Transient load failures show a retry state — never a fresh Create screen that
 * would let an existing owner re-create their store and hit a 409 (Priority 1).
 */
export function OnboardingV3() {
  const router = useRouter();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [stage, setStage] = useState<V3Stage>("create");
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [activeJob, setActiveJob] = useState<ImportJob | null>(null);
  // A redirect to the builder is in flight — keep the "Building…" screen up so
  // the create screen never flashes back while Next transitions.
  const handingOff = useRef(false);

  const goToBuild = useCallback(() => {
    if (handingOff.current) return;
    handingOff.current = true;
    setStage("build");
    // Mark onboarding complete server-side so the dashboard gate lets the owner
    // into the builder (which normally lives behind the setupStep === DONE
    // gate). Best-effort ordering mirrors the legacy website-theme step: the
    // redirect proceeds even if the status write is slow.
    void setSetupStep("DONE").catch(() => {
      // Non-fatal: the builder is still reachable; a stale setupStep self-heals
      // on the next load. Never block the handoff on it.
    });
    router.replace(BUILD_ROUTE);
  }, [router]);

  // Sets nothing synchronously — the initial `loading` state carries the first
  // render, and every resolution (ready/error/redirect) happens in the async
  // body below — so a transient failure resolves to a retry state instead of
  // flashing Create (Priority 1). Retrying resets to loading via handleRetry.
  const runLoad = useCallback(() => {
    let cancelled = false;

    (async () => {
      let store: Restaurant | null = null;
      try {
        ({ restaurant: store } = await getRestaurant());
      } catch (err) {
        if (cancelled) return;
        // Only a definitive 404 means "no store yet" → Create. 401 → session
        // gone. Anything else is transient → retry (never a fresh Create).
        if (isApiRequestError(err) && err.status === 404) {
          setRestaurant(null);
          setStage("create");
          setLoadState("ready");
          return;
        }
        if (isApiRequestError(err) && err.status === 401) {
          router.replace("/login");
          return;
        }
        setLoadState("error");
        return;
      }

      if (cancelled) return;
      setRestaurant(store);

      // Already finished the guided steps → the builder owns the rest (it is
      // itself resumable and handles an already-published site).
      if (store.setupStep === "DONE") {
        setStage("build");
        setLoadState("ready");
        handingOff.current = true;
        router.replace(BUILD_ROUTE);
        return;
      }

      // Otherwise derive the stage from import-job state.
      try {
        const { jobs } = await listImportJobs();
        if (cancelled) return;
        const resumable = jobs.find((job) => RESUMABLE_REVIEW.has(job.status));
        if (resumable) {
          setActiveJob(resumable);
          setStage("review");
        } else if (jobs.some((job) => job.status === "APPROVED")) {
          // Menu already saved but onboarding not marked done — go build.
          goToBuild();
        } else {
          setStage("create");
        }
      } catch {
        // Couldn't list jobs — fall back to Create. The store already exists,
        // so a re-analyze reuses it (no re-create), and this is non-destructive.
        if (!cancelled) setStage("create");
      }
      if (!cancelled) setLoadState("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [router, goToBuild]);

  useEffect(() => runLoad(), [runLoad]);

  function handleRetry() {
    setLoadState("loading");
    runLoad();
  }

  function handleAnalyzed(store: Restaurant, job: ImportJob) {
    setRestaurant(store);
    setActiveJob(job);
    setStage("review");
  }

  function handleReset() {
    setActiveJob(null);
    setStage("create");
  }

  // Skip AI import from Screen 1 — the store already exists (Screen 1 created
  // it); go straight to build, where the owner adds the menu manually.
  function handleSkipToBuild(store: Restaurant) {
    setRestaurant(store);
    goToBuild();
  }

  if (loadState === "loading") {
    return (
      <main className="flex min-h-screen w-full items-center justify-center bg-canvas text-sm text-ink-secondary">
        Loading…
      </main>
    );
  }

  if (loadState === "error") {
    return (
      <main className="flex min-h-screen w-full items-center justify-center overflow-x-hidden bg-canvas px-4 py-8 text-ink">
        <div className="w-full max-w-md rounded-[24px] border border-line bg-surface p-6 text-center shadow-[var(--ov-elevation)] sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">SOMETHING WENT WRONG</p>
          <h1 className="mt-2 text-2xl font-display font-semibold tracking-tight">We couldn&apos;t load your setup</h1>
          <p className="mt-3 text-sm leading-6 text-ink-secondary">
            This is usually temporary. Check your connection and try again — your progress is saved.
          </p>
          <button
            type="button"
            onClick={handleRetry}
            className="mt-6 flex min-h-14 w-full items-center justify-center rounded-2xl bg-brand px-5 text-base font-bold text-white shadow-lg shadow-black/10 transition active:scale-[0.99]"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  if (stage === "build") {
    return (
      <main className="flex min-h-screen w-full flex-col items-center justify-center gap-3 bg-canvas px-4 text-center text-ink">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-brand" aria-hidden="true" />
        <p className="text-sm text-ink-secondary">Building your storefront…</p>
      </main>
    );
  }

  return (
    <V3Shell stage={stage}>
      {stage === "create" && (
        <CreateBusinessScreen restaurant={restaurant} onAnalyzed={handleAnalyzed} onSkip={handleSkipToBuild} />
      )}
      {stage === "review" && activeJob && (
        <AnalysisReviewScreen initialJob={activeJob} onApproved={goToBuild} onReset={handleReset} onSkip={goToBuild} />
      )}
    </V3Shell>
  );
}
