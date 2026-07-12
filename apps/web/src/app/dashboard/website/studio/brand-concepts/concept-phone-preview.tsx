"use client";

import { useState } from "react";
import type { PreparedConcept } from "./concept-data";

const SCREENS = ["Home", "Menu", "Product", "Cart", "Checkout"] as const;
type Screen = (typeof SCREENS)[number];

function Block({ className = "" }: { className?: string }) {
  return <div className={`rounded-lg bg-[#F0E9DD] ${className}`} />;
}

function ScreenContent({ screen, colors, buttonStyle }: { screen: Screen; colors: PreparedConcept["colors"]; buttonStyle: string }) {
  const buttonRadius = buttonStyle.toLowerCase().includes("pill") || buttonStyle.toLowerCase().includes("rounded") ? "rounded-full" : "rounded-md";

  if (screen === "Home") {
    return (
      <div className="space-y-2">
        <Block className="h-16 w-full" />
        <Block className="h-2 w-3/4" />
        <Block className="h-2 w-1/2" />
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <Block className="h-8" />
          <Block className="h-8" />
          <Block className="h-8" />
        </div>
      </div>
    );
  }
  if (screen === "Menu") {
    return (
      <div className="space-y-2">
        <Block className="h-2 w-1/3" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <Block className="h-9 w-9 shrink-0" />
            <div className="flex-1 space-y-1">
              <Block className="h-2 w-3/4" />
              <Block className="h-1.5 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (screen === "Product") {
    return (
      <div className="space-y-2">
        <Block className="h-24 w-full" />
        <Block className="h-2.5 w-2/3" />
        <Block className="h-1.5 w-1/3" />
        <Block className="h-1.5 w-full" />
        <Block className="h-1.5 w-5/6" />
        <span className={`mt-2 block h-7 w-full ${buttonRadius}`} style={{ backgroundColor: colors.primary }} />
      </div>
    );
  }
  if (screen === "Cart") {
    return (
      <div className="space-y-2">
        <Block className="h-2 w-1/3" />
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <Block className="h-8 w-8 shrink-0" />
            <div className="flex-1 space-y-1">
              <Block className="h-1.5 w-2/3" />
              <Block className="h-1.5 w-1/3" />
            </div>
          </div>
        ))}
        <div className="mt-2 flex items-center justify-between">
          <Block className="h-2 w-1/4" />
          <Block className="h-2 w-1/5" />
        </div>
        <span className={`mt-1 block h-7 w-full ${buttonRadius}`} style={{ backgroundColor: colors.accent }} />
      </div>
    );
  }
  // Checkout
  return (
    <div className="space-y-2">
      <Block className="h-2 w-1/2" />
      <Block className="h-6 w-full" />
      <Block className="h-6 w-full" />
      <Block className="h-6 w-full" />
      <span className={`mt-2 block h-7 w-full ${buttonRadius}`} style={{ backgroundColor: colors.primary }} />
    </div>
  );
}

export function ConceptPhonePreview({ concept }: { concept: PreparedConcept }) {
  const [screen, setScreen] = useState<Screen>("Home");

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="mx-auto flex h-56 w-32 flex-col overflow-hidden rounded-[24px] border-[6px] border-[#171512] bg-white shadow-[0_12px_30px_rgba(48,39,27,0.18)]">
        <div className="h-6 w-full shrink-0" style={{ backgroundColor: concept.colors.primary }} />
        <div className="flex-1 overflow-y-auto p-2.5">
          <ScreenContent screen={screen} colors={concept.colors} buttonStyle={concept.buttonStyle} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-1">
        {SCREENS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setScreen(s)}
            aria-pressed={screen === s}
            className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition ${
              screen === s ? "bg-[#171512] text-white" : "bg-[#F7F0E5] text-[#756B5D] hover:bg-[#EEE5D9]"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
