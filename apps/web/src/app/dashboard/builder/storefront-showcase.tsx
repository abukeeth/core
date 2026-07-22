import type { ReactNode } from "react";
import { DevicePreview } from "../website/variations/[id]/device-preview";
import { LazyMount } from "./lazy-mount";

/**
 * The Storefront Showcase: the owner scrolls vertically through complete,
 * full-height storefront websites — not cards. Each storefront occupies nearly
 * the whole viewport and is the real DevicePreview render, scrollable inside
 * like a live site. Nothing sells the design except the storefront itself:
 * no descriptions, palette chips, or design commentary. The only chrome is a
 * sticky action bar carrying a quiet name and the "Use This Storefront" CTA.
 *
 * All three storefronts get identical treatment; the recommended one is simply
 * first, with a subtle "Recommended" marker in its action bar.
 */
export function StorefrontShowcase({ children }: { children: ReactNode }) {
  return (
    <div
      data-testid="storefront-showcase"
      className="h-[100svh] snap-y snap-mandatory overflow-y-auto overscroll-contain bg-[#F7F0E5] motion-reduce:snap-none"
    >
      {children}
    </div>
  );
}

export function StorefrontShowcaseSection({
  siteId,
  variationId,
  name,
  isRecommended,
  action,
}: {
  siteId: string;
  variationId: string;
  /** Quiet identity for the action bar only — never a headline over the hero. */
  name: string;
  isRecommended: boolean;
  /** The sticky "Use This Storefront" control, supplied by the caller. */
  action: ReactNode;
}) {
  return (
    <section
      data-testid="storefront-section"
      className="relative flex h-[100svh] snap-start flex-col px-3 pb-3 pt-3 sm:px-6 sm:pt-5"
    >
      {/* The storefront IS the presentation: real render, hero-first, fills the section. */}
      <div className="min-h-0 flex-1">
        <LazyMount
          className="h-full"
          placeholder={
            <div className="flex h-full w-full animate-pulse items-center justify-center rounded-2xl bg-[#EEE5D9]">
              <p className="text-sm font-semibold text-[#8A7D6C]">Loading storefront…</p>
            </div>
          }
        >
          <DevicePreview siteId={siteId} variationId={variationId} immersive />
        </LazyMount>
      </div>

      {/* Sticky action bar — always visible while this storefront is in view. */}
      <div className="sticky bottom-0 z-10 mt-3 flex items-center justify-between gap-3 rounded-full border border-[#E7DDCF] bg-white/95 px-4 py-2.5 shadow-[0_10px_30px_rgba(48,39,27,0.12)] backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          {isRecommended && (
            <span className="shrink-0 rounded-full bg-[#F3E7D3] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[#9A6A2F]">
              Recommended
            </span>
          )}
          <span className="truncate text-sm font-bold text-[#171512]">{name}</span>
        </div>
        <div className="shrink-0">{action}</div>
      </div>
    </section>
  );
}
