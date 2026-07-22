"use client";

import Link from "next/link";
import { DashboardDrawer } from "@/components/dashboard-drawer";
import { storefrontConcept } from "@/lib/storefront-concepts";
import { DevicePreview } from "../website/variations/[id]/device-preview";
import type { BuilderPhase, DesignCandidate } from "./use-restaurant-builder";

/**
 * The approval gate. Presents the generated options as complete "storefront
 * concepts" (business-oriented names, never themes/templates), shows the REAL
 * rendered preview via DevicePreview, and requires an explicit "Use this
 * storefront" before anything is published.
 *
 * Themes / style families stay internal: each concept's name comes from the
 * presentation-layer naming module; the internal `styleFamily` is never shown.
 * The recommended concept (highest score) leads and is marked as recommended.
 *
 * A single component renders the whole review→approving→publishing→failed band
 * so the preview stays mounted across those transitions; only the action bar
 * below it changes.
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

  // Recommended concept leads; the rest follow by score. Stable order (score
  // desc, id tie-break) so a given site never reshuffles between reloads. Each
  // option is named as a complete storefront concept — the internal style
  // family only selects the name and is never rendered.
  const options = [...candidates]
    .sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id))
    .map((candidate, index) => ({
      candidate,
      concept: storefrontConcept(candidate.businessType, candidate.styleFamily, index),
      isRecommended: index === 0,
    }));

  const selected = options.find((o) => o.candidate.id === selectedVersionId) ?? null;

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-[#F7F0E5] px-4 pb-28 pt-5 text-[#171512] sm:px-6 lg:px-10 lg:py-8">
      <DashboardDrawer />
      <div className="mx-auto w-full max-w-3xl">
        <header className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">REVIEW YOUR STOREFRONT</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Here&apos;s {restaurantName}&apos;s storefront</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#756B5D]">
            This is your real, live-quality preview. Look it over — nothing is public yet. When you&apos;re happy, publish it
            and we&apos;ll take it live.
          </p>
        </header>

        {/* Complete storefront concepts to choose between. Mobile-first: a
            horizontally-scrollable row that never overflows the page. */}
        {options.length > 1 && (
          <div className="mt-6">
            <p className="text-center text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">Choose your storefront</p>
            <div className="mt-3 flex justify-center gap-2 overflow-x-auto pb-1" role="group" aria-label="Storefront concepts">
              {options.map(({ candidate, concept, isRecommended }) => {
                const isSelected = candidate.id === selectedVersionId;
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => onSelectTheme(candidate.id)}
                    disabled={switchingTheme || busy}
                    aria-pressed={isSelected}
                    className={`relative min-h-11 shrink-0 rounded-full border px-5 text-sm font-bold transition active:scale-[0.98] disabled:opacity-60 ${
                      isSelected
                        ? "border-[#171512] bg-[#171512] text-white"
                        : "border-[#E7DDCF] bg-white text-[#171512] hover:border-[#B97824]"
                    }`}
                  >
                    {concept.name}
                    {isRecommended && (
                      <span
                        className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          isSelected ? "bg-white/20 text-white" : "bg-[#F3E7D3] text-[#9A6A2F]"
                        }`}
                      >
                        Recommended
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {switchingTheme && <p className="mt-2 text-center text-xs text-[#8A7D6C]">Applying…</p>}
          </div>
        )}

        {selected && (
          <div className="mt-5 text-center">
            <h2 className="text-lg font-bold">{selected.concept.name}</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-[#756B5D]">{selected.concept.description}</p>
          </div>
        )}

        <div className="mt-4 rounded-3xl border border-[#E7DDCF] bg-white p-4 shadow-[0_12px_36px_rgba(48,39,27,0.06)] sm:p-5">
          {selectedVersionId ? (
            <DevicePreview siteId={siteId} variationId={selectedVersionId} />
          ) : (
            <div className="flex h-[300px] w-full flex-col items-center justify-center gap-2 rounded-2xl bg-[#EEE5D9] text-center sm:h-[600px]">
              <p className="text-sm font-semibold text-[#8A7D6C]">Preview unavailable right now.</p>
              <p className="text-xs text-[#8A7D6C]">Your storefront was created, but we couldn&apos;t open the preview. Try choosing a storefront again.</p>
            </div>
          )}
        </div>

        {actionError && (phase === "approve_failed" || phase === "publish_failed") && (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-bold text-red-700">
              {phase === "approve_failed" ? "We couldn't approve this storefront" : "We couldn't publish your storefront"}
            </p>
            <p className="mt-1 text-sm text-red-700">{actionError}</p>
          </div>
        )}

        <div className="mt-6 flex flex-col items-center gap-3">
          {/* review: the primary approval action */}
          {phase === "review" && (
            <button
              type="button"
              onClick={onApprove}
              disabled={!selectedVersionId}
              className="min-h-14 w-full max-w-sm rounded-full bg-[#171512] px-8 py-3 text-base font-bold text-white shadow-lg shadow-black/10 transition active:scale-[0.99] disabled:opacity-50"
            >
              Use this storefront
            </button>
          )}

          {/* approving / publishing: in-progress, no premature success copy */}
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

          {/* approve_failed: retry approval only (re-runs approve → publish) */}
          {phase === "approve_failed" && (
            <button
              type="button"
              onClick={onRetryApprove}
              className="min-h-14 w-full max-w-sm rounded-full bg-[#171512] px-8 py-3 text-base font-bold text-white shadow-lg shadow-black/10 active:scale-[0.99]"
            >
              Try again
            </button>
          )}

          {/* publish_failed: retry publish only — approval persists, no regeneration */}
          {phase === "publish_failed" && (
            <button
              type="button"
              onClick={onRetryPublish}
              className="min-h-14 w-full max-w-sm rounded-full bg-[#171512] px-8 py-3 text-base font-bold text-white shadow-lg shadow-black/10 active:scale-[0.99]"
            >
              Try publishing again
            </button>
          )}

          {/* Secondary: safe route back to the full comparison surface — never auto-publishes. */}
          {!busy && (
            <Link
              href="/dashboard/website/variations"
              className="min-h-11 rounded-full border border-[#E7DDCF] bg-white px-5 py-2 text-sm font-bold text-[#171512]"
            >
              See your other storefronts
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
