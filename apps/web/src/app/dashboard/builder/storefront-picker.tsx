"use client";

import type { ReactNode } from "react";
import { DevicePreview } from "../website/variations/[id]/device-preview";
import { LazyMount } from "./lazy-mount";

/**
 * "Choose your favorite storefront" — the reference experience: three
 * phone-framed, complete storefront previews side by side (stacked on
 * mobile), each labeled A/B/C with its own generated personality words and a
 * single "Choose this design" action. The storefront inside each frame is the
 * REAL render (chromeless DevicePreview) — never a mockup, never an info card.
 */

const LETTERS = ["A", "B", "C", "D"];

export function StorefrontPicker({ heading, subheading, children }: { heading?: string; subheading?: string; children: ReactNode }) {
  return (
    <section data-testid="storefront-picker" className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6">
      <header className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-[#F5EFE3] sm:text-4xl">{heading ?? "Choose your favorite storefront"}</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#B9AE9A]">
          {subheading ?? "Each one has a different style and personality. Pick the one that fits you best."}
        </p>
      </header>
      <div className="mt-10 grid gap-8 md:grid-cols-3">{children}</div>
    </section>
  );
}

export function StorefrontPickerOption({
  index,
  siteId,
  variationId,
  businessName,
  personality,
  action,
}: {
  /** Display rank (0 = first) — rendered as the A/B/C badge. */
  index: number;
  siteId: string;
  variationId: string;
  /** Assistive-tech label only. */
  businessName: string;
  /** The generated direction's own personality words (e.g. "Bold. Elegant. Timeless."). */
  personality: string | null;
  action: ReactNode;
}) {
  const letter = LETTERS[index] ?? String(index + 1);
  return (
    <article
      data-testid="storefront-option"
      aria-label={`${businessName} — storefront ${letter}`}
      className="flex flex-col"
    >
      <div className="flex items-center gap-3 px-1 pb-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#C9A25B] text-sm font-extrabold text-[#211A0E]">{letter}</span>
        {personality && <p className="text-sm font-semibold tracking-wide text-[#E8DFC9]">{personality}</p>}
      </div>

      {/* The phone frame — the real storefront lives inside, scrollable. */}
      <div className="relative mx-auto w-full max-w-[360px] overflow-hidden rounded-[2.2rem] border-[6px] border-[#26221B] bg-[#26221B] shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
        <div className="h-[560px] overflow-hidden rounded-[1.85rem] bg-[#F7F0E5]">
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
        </div>
      </div>

      <div className="mx-auto mt-4 w-full max-w-[360px]">{action}</div>
    </article>
  );
}
