"use client";

import { StorefrontShowcase, StorefrontShowcaseSection } from "./storefront-showcase";
import type { BuilderPhase, DesignCandidate } from "./use-restaurant-builder";

/**
 * The storefront selection + approval gate. The owner scrolls vertically
 * through three complete, full-height storefront websites — real previews,
 * hero-first, one sticky "Use This Storefront" per storefront. The website
 * itself is the presentation: no cards, no concept names, no descriptions, no
 * palette chips, no device selectors, and no theme/template vocabulary. The
 * best-scoring storefront simply comes first.
 */
export function DesignReviewScreen({
  restaurantName,
  siteId,
  selectedVersionId,
  candidates,
  switchingTheme,
  onUse,
  phase,
  actionError,
  onRetryApprove,
  onRetryPublish,
}: {
  restaurantName: string;
  siteId: string;
  selectedVersionId: string | null;
  candidates: DesignCandidate[];
  switchingTheme: boolean;
  onUse: (versionId: string) => void;
  phase: BuilderPhase;
  actionError: string | null;
  onRetryApprove: () => void;
  onRetryPublish: () => void;
}) {
  const busy = phase === "approving" || phase === "publishing";

  // Best storefront first (highest score after the vertical-fit boost); stable
  // order (score desc, id tie-break) so a given site never reshuffles.
  const options = [...candidates].sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id));

  // One sticky CTA per storefront; it selects that storefront and runs the
  // exact approve → publish path. The active (selected) storefront's CTA
  // reflects progress/retry; the others stay "Use This Storefront".
  const base =
    "flex min-h-14 w-full items-center justify-center gap-2 rounded-full px-8 text-base font-bold text-white shadow-lg shadow-black/20 transition active:scale-[0.99]";
  const showcaseCta = (id: string) => {
    const active = id === selectedVersionId;
    if (busy && active) {
      return (
        <button type="button" disabled className={`${base} bg-[#171512] opacity-80`}>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
          {phase === "approving" ? "Setting up…" : "Publishing…"}
        </button>
      );
    }
    if (phase === "approve_failed" && active) {
      return <button type="button" onClick={onRetryApprove} className={`${base} bg-[#171512]`}>Try again</button>;
    }
    if (phase === "publish_failed" && active) {
      return <button type="button" onClick={onRetryPublish} className={`${base} bg-[#171512]`}>Try publishing again</button>;
    }
    return (
      <button
        type="button"
        onClick={() => onUse(id)}
        disabled={busy || switchingTheme}
        className={`${base} bg-[#171512] disabled:opacity-60`}
      >
        Use This Storefront
      </button>
    );
  };

  return (
    <main className="relative h-[100svh] w-full overflow-hidden bg-[#F7F0E5] text-[#171512]">
      {actionError && (phase === "approve_failed" || phase === "publish_failed") && (
        <div className="fixed inset-x-3 top-3 z-30 mx-auto max-w-md rounded-2xl border border-red-200 bg-red-50 p-3 text-center shadow-lg">
          <p className="text-sm font-bold text-red-700">{actionError}</p>
        </div>
      )}
      {options.length > 0 ? (
        <StorefrontShowcase>
          {options.map((candidate, index) => (
            <StorefrontShowcaseSection
              key={candidate.id}
              siteId={siteId}
              variationId={candidate.id}
              name={`${restaurantName} — storefront ${index + 1}`}
              action={showcaseCta(candidate.id)}
            />
          ))}
        </StorefrontShowcase>
      ) : (
        <div className="flex h-[100svh] flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-sm font-semibold text-[#8A7D6C]">Preview unavailable right now.</p>
          <p className="text-xs text-[#8A7D6C]">Your storefront was created, but we couldn&apos;t open the preview. Try again.</p>
        </div>
      )}
    </main>
  );
}
