"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSite,
  getGenerationStatus,
  getMySite,
  listVariations,
  publishSite,
  regenerateVariations,
  selectVariation,
  startGeneration,
  type GenerationJob,
} from "@/lib/api";
import { createTable } from "@/lib/owner-commerce-api";

const POLL_INTERVAL_MS = 1200;

export type BuilderPhase =
  | "loading"
  | "generating"
  | "finishing"
  | "done"
  | "generation_failed"
  | "finish_failed"
  | "bootstrap_failed";

export type FinishStepId = "SELECTING" | "PUBLISHING" | "PROVISIONING";

export interface FinishFailure {
  step: FinishStepId;
  message: string;
}

/** A candidate design considered during the auto-select moment — just enough to dramatize the choice, not the full definition. */
export interface DesignCandidate {
  id: string;
  colorSeed: string | null;
  overall: number;
}

export interface WinningDesign {
  tagline: string;
  cuisine: string;
  colorSeed: string;
}

export interface BuilderState {
  phase: BuilderPhase;
  job: GenerationJob | null;
  siteId: string | null;
  siteSlug: string | null;
  publishedVersionId: string | null;
  /** Which of the post-generation client-orchestrated steps is active — only meaningful while phase is "finishing" or "finish_failed". */
  finishStepId: FinishStepId;
  finishFailure: FinishFailure | null;
  /** All generated candidates plus the winning id, known as soon as SELECTING starts — powers the "dramatize the choice" moment. */
  candidates: DesignCandidate[];
  winnerId: string | null;
  /** The winning design's brand details — known from SELECTING onward, used to personalize captions and show real color sooner. */
  winningDesign: WinningDesign | null;
  qrToken: string | null;
  qrError: string | null;
  bootstrapError: string | null;
  retryGeneration: () => void;
  retryFinish: () => void;
  retryBootstrap: () => void;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/**
 * Orchestrates the fused "AI Restaurant Builder" pipeline over existing,
 * already-working endpoints: create/reuse the site, run the existing async
 * generation job (polled here, same endpoint the manual Website hub already
 * uses), then auto-select the best-scoring variation, auto-publish, and
 * auto-provision one starter QR-ordering code. Nothing here is a new
 * backend capability — this hook is the seam that turns five previously
 * separate, manual dashboard actions into one continuous experience.
 *
 * Resumable by design: reloading this page re-derives state from the
 * server (current Site/GenerationJob status) rather than replaying the
 * animation from scratch.
 */
export function useRestaurantBuilder(): BuilderState {
  const [phase, setPhase] = useState<BuilderPhase>("loading");
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [siteSlug, setSiteSlug] = useState<string | null>(null);
  const [publishedVersionId, setPublishedVersionId] = useState<string | null>(null);
  const [finishStepId, setFinishStepId] = useState<FinishStepId>("SELECTING");
  const [finishFailure, setFinishFailure] = useState<FinishFailure | null>(null);
  const [candidates, setCandidates] = useState<DesignCandidate[]>([]);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [winningDesign, setWinningDesign] = useState<WinningDesign | null>(null);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const hasBootstrapped = useRef(false);

  const runFinishSequence = useCallback(async (id: string) => {
    setFinishFailure(null);
    setFinishStepId("SELECTING");
    let bestVersionId: string;
    try {
      const { variations } = await listVariations(id);
      if (variations.length === 0) {
        throw new Error("No design variations were generated");
      }
      const best = variations.reduce((current, candidate) => {
        const currentScore = current.scores?.[0]?.overall ?? -1;
        const candidateScore = candidate.scores?.[0]?.overall ?? -1;
        return candidateScore > currentScore ? candidate : current;
      }, variations[0]!);
      bestVersionId = best.id;
      setCandidates(
        variations.map((v) => ({ id: v.id, colorSeed: v.definition?.colorSeed ?? null, overall: v.scores?.[0]?.overall ?? 0 })),
      );
      setWinnerId(bestVersionId);
      if (best.definition) {
        setWinningDesign({
          tagline: best.definition.tagline,
          cuisine: best.definition.cuisine,
          colorSeed: best.definition.colorSeed,
        });
      }
      await selectVariation(id, bestVersionId);
    } catch (err) {
      setFinishFailure({ step: "SELECTING", message: errorMessage(err, "Couldn't choose your best design") });
      setPhase("finish_failed");
      return;
    }

    setFinishStepId("PUBLISHING");
    try {
      const { version } = await publishSite(id);
      setPublishedVersionId(version.id);
    } catch (err) {
      setFinishFailure({ step: "PUBLISHING", message: errorMessage(err, "Couldn't publish your website") });
      setPhase("finish_failed");
      return;
    }

    setFinishStepId("PROVISIONING");
    try {
      const { table } = await createTable("Scan to Order");
      setQrToken(table.qrToken);
    } catch (err) {
      // Non-fatal — a missing QR code shouldn't block the reveal; the
      // owner can create one anytime from the Tables page.
      setQrError(errorMessage(err, "Couldn't create your QR code yet"));
    }

    setPhase("done");
  }, []);

  const bootstrap = useCallback(async () => {
    setPhase("loading");
    setBootstrapError(null);

    let site;
    try {
      ({ site } = await getMySite());
    } catch {
      try {
        ({ site } = await createSite());
      } catch (err) {
        setBootstrapError(errorMessage(err, "Couldn't start building your restaurant"));
        setPhase("bootstrap_failed");
        return;
      }
    }

    setSiteId(site.id);
    setSiteSlug(site.slug);

    if (site.status === "PUBLISHED") {
      setPublishedVersionId(site.publishedVersionId);
      setPhase("done");
      return;
    }

    try {
      const { job: existingJob } = await getGenerationStatus(site.id);

      if (existingJob && (existingJob.status === "PENDING" || existingJob.status === "RUNNING")) {
        setJob(existingJob);
        setPhase("generating");
        return;
      }

      if (existingJob && existingJob.status === "COMPLETED") {
        setJob(existingJob);
        setPhase("finishing");
        await runFinishSequence(site.id);
        return;
      }

      if (existingJob && existingJob.status === "FAILED") {
        setJob(existingJob);
        setPhase("generation_failed");
        return;
      }

      const { job: newJob } = await startGeneration(site.id);
      setJob(newJob);
      setPhase("generating");
    } catch (err) {
      setBootstrapError(errorMessage(err, "Couldn't start building your restaurant"));
      setPhase("bootstrap_failed");
    }
  }, [runFinishSequence]);

  useEffect(() => {
    if (hasBootstrapped.current) return;
    hasBootstrapped.current = true;
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (phase !== "generating" || !siteId) return;
    let cancelled = false;

    const interval = setInterval(async () => {
      try {
        const { job: latest } = await getGenerationStatus(siteId);
        if (cancelled || !latest) return;
        setJob(latest);
        if (latest.status === "COMPLETED") {
          setPhase("finishing");
          void runFinishSequence(siteId);
        } else if (latest.status === "FAILED") {
          setPhase("generation_failed");
        }
      } catch {
        // Transient fetch failure — keep polling on the next tick.
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [phase, siteId, runFinishSequence]);

  const retryGeneration = useCallback(() => {
    if (!siteId) return;
    void (async () => {
      try {
        const { job: newJob } = await regenerateVariations(siteId);
        setJob(newJob);
        setPhase("generating");
      } catch (err) {
        setBootstrapError(errorMessage(err, "Couldn't restart generation"));
        setPhase("bootstrap_failed");
      }
    })();
  }, [siteId]);

  const retryFinish = useCallback(() => {
    if (!siteId) return;
    setPhase("finishing");
    void runFinishSequence(siteId);
  }, [siteId, runFinishSequence]);

  const retryBootstrap = useCallback(() => {
    hasBootstrapped.current = false;
    void bootstrap();
  }, [bootstrap]);

  return {
    phase,
    job,
    siteId,
    siteSlug,
    publishedVersionId,
    finishStepId,
    finishFailure,
    candidates,
    winnerId,
    winningDesign,
    qrToken,
    qrError,
    bootstrapError,
    retryGeneration,
    retryFinish,
    retryBootstrap,
  };
}
