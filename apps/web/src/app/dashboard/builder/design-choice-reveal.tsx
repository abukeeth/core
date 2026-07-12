"use client";

import { useEffect, useState } from "react";
import type { DesignCandidate } from "./use-restaurant-builder";

/**
 * Dramatizes the auto-select moment: shows the (up to three) generated
 * designs as color swatch cards, then — after a short beat — scales/glows
 * the winner and fades the others. Purely presentational: the winner was
 * already chosen by score before this ever renders.
 */
export function DesignChoiceReveal({
  candidates,
  winnerId,
  reducedMotion,
}: {
  candidates: DesignCandidate[];
  winnerId: string | null;
  reducedMotion: boolean;
}) {
  const [revealed, setRevealed] = useState(reducedMotion);

  useEffect(() => {
    if (reducedMotion) return;
    const timer = setTimeout(() => setRevealed(true), 700);
    return () => clearTimeout(timer);
  }, [reducedMotion]);

  const shown = candidates.slice(0, 3);

  return (
    <div className="mx-auto flex w-full max-w-md items-center justify-center gap-3">
      {shown.map((candidate) => {
        const isWinner = candidate.id === winnerId;
        return (
          <div
            key={candidate.id}
            className={`flex-1 rounded-lg border p-3 transition-all duration-500 ${
              revealed && !isWinner ? "scale-90 opacity-40" : ""
            } ${
              revealed && isWinner
                ? "scale-110 border-black/20 shadow-lg dark:border-white/30"
                : "border-black/[.08] dark:border-white/[.145]"
            }`}
          >
            <div
              className="h-16 w-full rounded-md"
              style={{ backgroundColor: candidate.colorSeed ?? "#a1a1aa" }}
            />
            {revealed && isWinner && (
              <p className="mt-2 text-center text-[11px] font-semibold text-black dark:text-zinc-50">Your best fit</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
