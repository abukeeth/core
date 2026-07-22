"use client";

import { DashboardDrawer } from "@/components/dashboard-drawer";
import { storefrontConcept } from "@/lib/storefront-concepts";
import { StorefrontConceptCard } from "./storefront-concept-card";
import type { BuilderPhase, DesignCandidate } from "./use-restaurant-builder";

/**
 * The storefront selection + approval gate. The recommended storefront
 * dominates the screen as a complete business site (large real preview, concept
 * name, description, brand identity, primary "Use This Storefront" CTA); the
 * other generated storefronts sit below as alternatives. Everything is a REAL
 * rendered preview — never a schematic or placeholder.
 *
 * Themes / style families stay internal: each option's identity comes from the
 * presentation-layer naming module and the internal style family is never
 * shown. Mobile-first; the preview auto-selects the iPhone view on a phone.
 */
export function DesignReviewScreen({
  restaurantName,
  siteId,
  selectedVersionId,
  candidates,
  switchingTheme,
  onSelectTheme,
  phase,
  actionError,
  onApprove,
  onRetryApprove,
  onRetryPublish,
}: {
  restaurantName: string;
  siteId: string;
  selectedVersionId: string | null;
  candidates: DesignCandidate[];
  switchingTheme: boolean;
  onSelectTheme: (versionId: string) => void;
  phase: BuilderPhase;
  actionError: string | null;
  onApprove: () => void;
  onRetryApprove: () => void;
  onRetryPublish: () => void;
}) {
  const busy = phase === "approving" || phase === "publishing";

  // Recommended concept leads (highest score after the vertical-fit boost);
  // the rest follow by score. Stable order (score desc, id tie-break) so a
  // given site never reshuffles between reloads.
  const options = [...candidates]
    .sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id))
    .map((candidate, index) => ({
      candidate,
      concept: storefrontConcept(candidate.restaurantName, index),
    }));

  const recommendedId = options[0]?.candidate.id ?? null;
  const dominant = options.find((o) => o.candidate.id === selectedVersionId) ?? null;
  const alternatives = options.filter((o) => o.candidate.id !== dominant?.candidate.id);

  const primaryAction = (
    <div className="flex flex-col items-center gap-3">
      {phase === "review" && (
        <button
          type="button"
          onClick={onApprove}
          className="min-h-14 w-full max-w-sm rounded-full bg-[#171512] px-8 py-3 text-base font-bold text-white shadow-lg shadow-black/10 transition active:scale-[0.99]"
        >
          Use This Storefront
        </button>
      )}
      {busy && (
        <button
          type="button"
          disabled
          className="flex min-h-14 w-full max-w-sm items-center justify-center gap-2 rounded-full bg-[#171512] px-8 py-3 text-base font-bold text-white opacity-80"
        >
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
          {phase === "approving" ? "Setting up your storefront…" : "Publishing your storefront…"}
        </button>
      )}
      {phase === "approve_failed" && (
        <button
          type="button"
          onClick={onRetryApprove}
          className="min-h-14 w-full max-w-sm rounded-full bg-[#171512] px-8 py-3 text-base font-bold text-white shadow-lg shadow-black/10 active:scale-[0.99]"
        >
          Try again
        </button>
      )}
      {phase === "publish_failed" && (
        <button
          type="button"
          onClick={onRetryPublish}
          className="min-h-14 w-full max-w-sm rounded-full bg-[#171512] px-8 py-3 text-base font-bold text-white shadow-lg shadow-black/10 active:scale-[0.99]"
        >
          Try publishing again
        </button>
      )}
    </div>
  );

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-[#F7F0E5] px-4 pb-28 pt-5 text-[#171512] sm:px-6 lg:px-10 lg:py-8">
      <DashboardDrawer />
      <div className="mx-auto w-full max-w-2xl">
        <header className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">REVIEW YOUR STOREFRONT</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Here&apos;s {restaurantName}&apos;s storefront</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#756B5D]">
            This is your real, live-quality preview. Nothing is public yet — when you&apos;re happy, publish it and we&apos;ll
            take it live.
          </p>
        </header>

        {actionError && (phase === "approve_failed" || phase === "publish_failed") && (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-bold text-red-700">
              {phase === "approve_failed" ? "We couldn't approve this storefront" : "We couldn't publish your storefront"}
            </p>
            <p className="mt-1 text-sm text-red-700">{actionError}</p>
          </div>
        )}

        {dominant ? (
          <div className="mt-6">
            <StorefrontConceptCard
              siteId={siteId}
              variationId={dominant.candidate.id}
              concept={dominant.concept}
              palette={dominant.candidate.palette}
              tagline={dominant.candidate.tagline}
              isRecommended={dominant.candidate.id === recommendedId}
              dominant
              action={primaryAction}
            />
          </div>
        ) : (
          <div className="mt-6 flex h-[300px] w-full flex-col items-center justify-center gap-2 rounded-3xl border border-[#E7DDCF] bg-white text-center sm:h-[420px]">
            <p className="text-sm font-semibold text-[#8A7D6C]">Preview unavailable right now.</p>
            <p className="text-xs text-[#8A7D6C]">Your storefront was created, but we couldn&apos;t open the preview. Try choosing a storefront again.</p>
          </div>
        )}

        {alternatives.length > 0 && (
          <section className="mt-8">
            <h2 className="text-center text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">Other storefronts we designed for you</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {alternatives.map(({ candidate, concept }) => (
                <StorefrontConceptCard
                  key={candidate.id}
                  siteId={siteId}
                  variationId={candidate.id}
                  concept={concept}
                  palette={candidate.palette}
                  tagline={candidate.tagline}
                  isRecommended={candidate.id === recommendedId}
                  dominant={false}
                  action={
                    <button
                      type="button"
                      onClick={() => onSelectTheme(candidate.id)}
                      disabled={switchingTheme || busy}
                      aria-label={`See ${concept.name}`}
                      className="min-h-11 w-full rounded-full border border-[#171512] bg-white px-5 py-2 text-sm font-bold text-[#171512] transition active:scale-[0.98] disabled:opacity-60 hover:bg-[#171512] hover:text-white"
                    >
                      See this storefront
                    </button>
                  }
                />
              ))}
            </div>
            {switchingTheme && <p className="mt-3 text-center text-xs text-[#8A7D6C]">Applying…</p>}
          </section>
        )}
      </div>
    </main>
  );
}
