"use client";

import Link from "next/link";
import { DashboardDrawer } from "@/components/dashboard-drawer";
import { DevicePreview } from "../website/variations/[id]/device-preview";
import type { BuilderPhase } from "./use-restaurant-builder";

/**
 * The approval gate. Shows the owner the REAL rendered preview (the same
 * DevicePreview/iframe the manual Website hub uses — not the schematic
 * build animation), and requires an explicit "Approve this design" before
 * anything is published. Publishing, and the success reveal, happen only
 * after the backend confirms both approvePreview and publishSite — so no
 * "you're live" messaging can appear here.
 *
 * A single component renders the whole review→approving→publishing→failed
 * band so the preview stays mounted (and the owner's context is preserved)
 * across those transitions; only the action bar below it changes.
 */
export function DesignReviewScreen({
  restaurantName,
  siteId,
  selectedVersionId,
  phase,
  actionError,
  onApprove,
  onRetryApprove,
  onRetryPublish,
}: {
  restaurantName: string;
  siteId: string;
  selectedVersionId: string | null;
  phase: BuilderPhase;
  actionError: string | null;
  onApprove: () => void;
  onRetryApprove: () => void;
  onRetryPublish: () => void;
}) {
  const busy = phase === "approving" || phase === "publishing";

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-[#F7F0E5] px-4 pb-28 pt-5 text-[#171512] sm:px-6 lg:px-10 lg:py-8">
      <DashboardDrawer />
      <div className="mx-auto w-full max-w-3xl">
        <header className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">REVIEW YOUR DESIGN</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Here&apos;s {restaurantName}&apos;s website</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#756B5D]">
            This is your real, live-quality preview. Look it over — nothing is public yet. When you&apos;re happy, approve it
            and we&apos;ll publish it for you.
          </p>
        </header>

        <div className="mt-6 rounded-3xl border border-[#E7DDCF] bg-white p-4 shadow-[0_12px_36px_rgba(48,39,27,0.06)] sm:p-5">
          {selectedVersionId ? (
            <DevicePreview siteId={siteId} variationId={selectedVersionId} />
          ) : (
            <div className="flex h-[300px] w-full flex-col items-center justify-center gap-2 rounded-2xl bg-[#EEE5D9] text-center sm:h-[600px]">
              <p className="text-sm font-semibold text-[#8A7D6C]">Preview unavailable right now.</p>
              <p className="text-xs text-[#8A7D6C]">Your design was created, but we couldn&apos;t open the preview. Try choosing a design again.</p>
            </div>
          )}
        </div>

        {actionError && (phase === "approve_failed" || phase === "publish_failed") && (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-bold text-red-700">
              {phase === "approve_failed" ? "We couldn't approve this design" : "We couldn't publish your website"}
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
              Approve this design
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
              {phase === "approving" ? "Approving your design…" : "Publishing your website…"}
            </button>
          )}

          {/* approve_failed: retry approval only (re-runs approve → publish) */}
          {phase === "approve_failed" && (
            <button
              type="button"
              onClick={onRetryApprove}
              className="min-h-14 w-full max-w-sm rounded-full bg-[#171512] px-8 py-3 text-base font-bold text-white shadow-lg shadow-black/10 active:scale-[0.99]"
            >
              Try approving again
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

          {/* Secondary: safe route back to the real comparison surface — never auto-publishes. */}
          {!busy && (
            <Link
              href="/dashboard/website/variations"
              className="min-h-11 rounded-full border border-[#E7DDCF] bg-white px-5 py-2 text-sm font-bold text-[#171512]"
            >
              Choose another design
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
