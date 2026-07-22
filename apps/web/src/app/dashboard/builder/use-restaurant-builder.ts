"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  approvePreview,
  createSite,
  getGenerationStatus,
  getMySite,
  listVariations,
  publishSite,
  regenerateVariations,
  selectVariation,
  startGeneration,
  type GenerationJob,
  type StyleFamily,
} from "@/lib/api";
import { createTable } from "@/lib/owner-commerce-api";

const POLL_INTERVAL_MS = 1200;

/**
 * The builder no longer auto-publishes. After generation, a design is
 * auto-*selected* only so a real, previewable draft exists; the owner must
 * then look at the real preview and explicitly approve it before anything
 * goes live. Publishing (and QR provisioning + the success reveal) runs
 * ONLY after approvePreview + publishSite both confirm success — mirroring
 * the backend's own PREVIEW_APPROVAL gate (site.service.ts:
 * validatePublishReadiness), which selectVariation deliberately clears and
 * publishSite refuses to bypass. See
 * docs/audits/AI_BUILDER_APPROVAL_FIX_IMPLEMENTATION.md.
 */
export type BuilderPhase =
  | "loading"
  | "generating"
  | "generation_failed"
  | "selecting"
  | "select_failed"
  | "review"
  | "approving"
  | "approve_failed"
  | "publishing"
  | "publish_failed"
  | "done"
  | "bootstrap_failed";

/**
 * A generated design option — one per style family (LUXURY/MODERN/MINIMAL).
 * Powers the Design Review theme switcher (each renders the same business
 * data through a different theme) and the finale's personalized captions.
 */
export interface DesignCandidate {
  id: string;
  styleFamily: StyleFamily | null;
  businessType: string | null;
  colorSeed: string | null;
  tagline: string | null;
  cuisine: string | null;
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
  /** The real https://<slug>.<SITE_PLATFORM_DOMAIN> URL, from the API (getMine/create both return it) — never hardcode this suffix on the frontend, it varies per deployment. */
  siteDomain: string | null;
  publishedVersionId: string | null;
  /** All generated candidates plus the selected id — powers the design-choice reveal and personalizes captions. */
  candidates: DesignCandidate[];
  /** The variation the owner is reviewing / will approve — the versionId the real preview renders. Changes when they switch themes. */
  selectedVersionId: string | null;
  /** True while a theme switch is persisting (selectVariation in flight). */
  switchingTheme: boolean;
  winningDesign: WinningDesign | null;
  qrToken: string | null;
  qrError: string | null;
  bootstrapError: string | null;
  /** Message for a failed select/approve/publish stage — meaningful in the *_failed phases only. */
  actionError: string | null;
  /** Switch to a different generated theme (persists via selectVariation) and re-preview it. */
  selectTheme: (versionId: string) => void;
  /** Owner-initiated: approve the previewed design, then publish. */
  approveDesign: () => void;
  /** Stage-scoped retries — each retries ONLY its own failed stage, never regeneration. */
  retrySelect: () => void;
  retryApprove: () => void;
  retryPublish: () => void;
  /** Regeneration — only offered on a generation failure. */
  retryGeneration: () => void;
  retryBootstrap: () => void;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/**
 * Orchestrates the AI Builder pipeline over existing, already-working
 * endpoints: create/reuse the site, run the existing async generation job
 * (polled here), auto-select the best-scoring variation so a real preview
 * exists, then STOP at a review gate. Approval + publish + QR provisioning
 * happen only on an explicit owner action.
 *
 * Resumable by design: reloading re-derives state from the server (current
 * Site/GenerationJob status) rather than replaying from scratch. A site
 * whose generation is COMPLETED resumes to the review gate, never to a
 * silent auto-publish.
 */
export function useRestaurantBuilder(): BuilderState {
  const [phase, setPhase] = useState<BuilderPhase>("loading");
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [siteSlug, setSiteSlug] = useState<string | null>(null);
  const [siteDomain, setSiteDomain] = useState<string | null>(null);
  const [publishedVersionId, setPublishedVersionId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<DesignCandidate[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [switchingTheme, setSwitchingTheme] = useState(false);
  const [winningDesign, setWinningDesign] = useState<WinningDesign | null>(null);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const hasBootstrapped = useRef(false);

  // Auto-select the best-scoring variation so a real, previewable draft
  // exists — then hand off to the review gate. Never publishes.
  const runSelection = useCallback(async (id: string) => {
    setActionError(null);
    setPhase("selecting");
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
      setCandidates(
        variations.map((v) => ({
          id: v.id,
          styleFamily: v.styleFamily,
          businessType: v.definition?.businessType ?? null,
          colorSeed: v.definition?.colorSeed ?? null,
          tagline: v.definition?.tagline ?? null,
          cuisine: v.definition?.cuisine ?? null,
          overall: v.scores?.[0]?.overall ?? 0,
        })),
      );
      setSelectedVersionId(best.id);
      if (best.definition) {
        setWinningDesign({ tagline: best.definition.tagline, cuisine: best.definition.cuisine, colorSeed: best.definition.colorSeed });
      }
      await selectVariation(id, best.id);
      setPhase("review");
    } catch (err) {
      setActionError(errorMessage(err, "Couldn't prepare your design for review"));
      setPhase("select_failed");
    }
  }, []);

  // Publish an already-approved design, then (non-fatally) provision a
  // starter QR code, then reveal success. Separated from approval so a
  // publish failure retries publish alone — approval persists on the
  // server across a failed publish (publishSite clears previewApprovedAt
  // only inside its own successful transaction).
  const runPublish = useCallback(async (id: string) => {
    setActionError(null);
    setPhase("publishing");
    try {
      const { version } = await publishSite(id);
      setPublishedVersionId(version.id);
    } catch (err) {
      setActionError(errorMessage(err, "Couldn't publish your website"));
      setPhase("publish_failed");
      return;
    }

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

  // Owner-initiated approval: satisfy the backend PREVIEW_APPROVAL gate,
  // then publish. Publish never runs unless approvePreview resolved first.
  const runApproveThenPublish = useCallback(
    async (id: string) => {
      setActionError(null);
      setPhase("approving");
      try {
        await approvePreview(id);
      } catch (err) {
        setActionError(errorMessage(err, "Couldn't approve your design"));
        setPhase("approve_failed");
        return;
      }
      await runPublish(id);
    },
    [runPublish],
  );

  const bootstrap = useCallback(async () => {
    setPhase("loading");
    setBootstrapError(null);

    let site;
    let temporaryDomain: string | null = null;
    try {
      ({ site, temporaryDomain } = await getMySite());
    } catch {
      try {
        ({ site, temporaryDomain } = await createSite());
      } catch (err) {
        setBootstrapError(errorMessage(err, "Couldn't start building your restaurant"));
        setPhase("bootstrap_failed");
        return;
      }
    }

    setSiteId(site.id);
    setSiteDomain(temporaryDomain);
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
        // Resume to the review gate — NOT a silent auto-publish.
        await runSelection(site.id);
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
  }, [runSelection]);

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
          void runSelection(siteId);
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
  }, [phase, siteId, runSelection]);

  const approveDesign = useCallback(() => {
    if (!siteId) return;
    void runApproveThenPublish(siteId);
  }, [siteId, runApproveThenPublish]);

  // Switch to a different generated theme before publishing. Persists the
  // choice (selectVariation → the new draft, single-draft invariant on the
  // server) and re-points the real preview at it. No-op for the current
  // selection or while another switch is in flight.
  const selectTheme = useCallback(
    (versionId: string) => {
      if (!siteId || versionId === selectedVersionId || switchingTheme) return;
      const candidate = candidates.find((c) => c.id === versionId);
      void (async () => {
        setSwitchingTheme(true);
        setActionError(null);
        try {
          await selectVariation(siteId, versionId);
          setSelectedVersionId(versionId);
          if (candidate?.colorSeed) {
            setWinningDesign({ tagline: candidate.tagline ?? "", cuisine: candidate.cuisine ?? "", colorSeed: candidate.colorSeed });
          }
        } catch (err) {
          setActionError(errorMessage(err, "Couldn't switch theme — please try again"));
        } finally {
          setSwitchingTheme(false);
        }
      })();
    },
    [siteId, selectedVersionId, switchingTheme, candidates],
  );

  const retrySelect = useCallback(() => {
    if (!siteId) return;
    void runSelection(siteId);
  }, [siteId, runSelection]);

  const retryApprove = useCallback(() => {
    if (!siteId) return;
    void runApproveThenPublish(siteId);
  }, [siteId, runApproveThenPublish]);

  // Publish already-approved design again — does NOT re-approve or
  // regenerate. Safe because a failed publish leaves previewApprovedAt set.
  const retryPublish = useCallback(() => {
    if (!siteId) return;
    void runPublish(siteId);
  }, [siteId, runPublish]);

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

  const retryBootstrap = useCallback(() => {
    hasBootstrapped.current = false;
    void bootstrap();
  }, [bootstrap]);

  return {
    phase,
    job,
    siteId,
    siteSlug,
    siteDomain,
    publishedVersionId,
    candidates,
    selectedVersionId,
    switchingTheme,
    selectTheme,
    winningDesign,
    qrToken,
    qrError,
    bootstrapError,
    actionError,
    approveDesign,
    retrySelect,
    retryApprove,
    retryPublish,
    retryGeneration,
    retryBootstrap,
  };
}
