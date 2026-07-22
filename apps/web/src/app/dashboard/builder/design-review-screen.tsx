"use client";

import { StorefrontPicker, StorefrontPickerOption } from "./storefront-picker";
import type { BuilderPhase, DesignCandidate } from "./use-restaurant-builder";

/**
 * The storefront selection + approval gate — the reference experience:
 * "Choose your favorite storefront" over three phone-framed, COMPLETE
 * storefront previews (real renders), each with its own generated personality
 * words and one "Choose this design" action. No theme vocabulary, no info
 * cards, no palette chips, no device selectors.
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

  // Best storefront first; stable order (score desc, id tie-break).
  const options = [...candidates].sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id));

  const base =
    "flex min-h-14 w-full items-center justify-center gap-2 rounded-full px-8 text-base font-bold transition active:scale-[0.99]";
  const chooseCta = (id: string) => {
    const active = id === selectedVersionId;
    if (busy && active) {
      return (
        <button type="button" disabled className={`${base} bg-[#C9A25B] text-[#211A0E] opacity-80`}>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" aria-hidden="true" />
          {phase === "approving" ? "Setting up…" : "Publishing…"}
        </button>
      );
    }
    if (phase === "approve_failed" && active) {
      return <button type="button" onClick={onRetryApprove} className={`${base} bg-[#C9A25B] text-[#211A0E]`}>Try again</button>;
    }
    if (phase === "publish_failed" && active) {
      return <button type="button" onClick={onRetryPublish} className={`${base} bg-[#C9A25B] text-[#211A0E]`}>Try publishing again</button>;
    }
    return (
      <button
        type="button"
        onClick={() => onUse(id)}
        disabled={busy || switchingTheme}
        className={`${base} bg-[#C9A25B] text-[#211A0E] shadow-[0_10px_28px_rgba(201,162,91,0.35)] disabled:opacity-60`}
      >
        Choose this design →
      </button>
    );
  };

  return (
    <main className="min-h-[100svh] w-full overflow-x-hidden bg-[#161310] text-[#F5EFE3]">
      {actionError && (phase === "approve_failed" || phase === "publish_failed") && (
        <div className="fixed inset-x-3 top-3 z-30 mx-auto max-w-md rounded-2xl border border-red-300 bg-red-50 p-3 text-center shadow-lg">
          <p className="text-sm font-bold text-red-700">{actionError}</p>
        </div>
      )}
      {options.length > 0 ? (
        <StorefrontPicker>
          {options.map((candidate, index) => (
            <StorefrontPickerOption
              key={candidate.id}
              index={index}
              siteId={siteId}
              variationId={candidate.id}
              businessName={restaurantName}
              personality={candidate.displayPersonality}
              action={chooseCta(candidate.id)}
            />
          ))}
        </StorefrontPicker>
      ) : (
        <div className="flex h-[100svh] flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-sm font-semibold text-[#B9AE9A]">Preview unavailable right now.</p>
          <p className="text-xs text-[#B9AE9A]">Your storefront was created, but we couldn&apos;t open the preview. Try again.</p>
        </div>
      )}
    </main>
  );
}
