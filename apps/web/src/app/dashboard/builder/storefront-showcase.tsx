import type { ReactNode } from "react";
import { DevicePreview } from "../website/variations/[id]/device-preview";
import { LazyMount } from "./lazy-mount";

/**
 * The Storefront Showcase: the owner scrolls vertically through complete,
 * full-height storefront websites — not cards. Each storefront occupies nearly
 * the whole viewport and is the real DevicePreview render, scrollable inside
 * like a live site. Nothing sells the design except the storefront itself:
 * no names, descriptions, badges, palette chips, or design commentary. The only
 * chrome is a sticky "Use This Storefront" CTA. All three storefronts get
 * identical treatment; the best-scoring one is simply first.
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
  action,
}: {
  siteId: string;
  variationId: string;
  /** Only used to label the section for assistive tech — never shown as chrome. */
  name: string;
  /** The single "Use This Storefront" control, supplied by the caller. */
  action: ReactNode;
}) {
  return (
    <section
      aria-label={name}
      data-testid="storefront-section"
      className="relative h-[100svh] snap-start overflow-hidden bg-[#F7F0E5]"
    >
      {/* The storefront IS the presentation: full-bleed real render, hero-first,
          zero preview/dashboard chrome — the owner enters it as if it were live. */}
      <LazyMount
        className="h-full w-full"
        placeholder={
          <div className="flex h-full w-full animate-pulse items-center justify-center bg-[#EEE5D9]">
            <p className="text-sm font-semibold text-[#8A7D6C]">Loading storefront…</p>
          </div>
        }
      >
        <DevicePreview siteId={siteId} variationId={variationId} chromeless />
      </LazyMount>

      {/* One action, at the bottom of the storefront. Nothing else. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2 bg-gradient-to-t from-black/30 via-black/10 to-transparent px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-12">
        <div className="pointer-events-auto w-full max-w-md">{action}</div>
      </div>
    </section>
  );
}
