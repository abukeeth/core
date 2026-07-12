"use client";

import { useEffect, useState } from "react";
import { Check, Sparkles } from "lucide-react";

const STAGES = [
  "Analyzing your business...",
  "Building your brand identity...",
  "Creating layouts...",
  "Designing mobile experience...",
  "Preparing storefront...",
] as const;

const STAGE_DURATION_MS = 850;

interface GenerateConceptsButtonProps {
  onComplete: () => void;
}

export function GenerateConceptsButton({ onComplete }: GenerateConceptsButtonProps) {
  const [generating, setGenerating] = useState(false);
  const [activeStage, setActiveStage] = useState(0);

  useEffect(() => {
    if (!generating) return;
    if (activeStage >= STAGES.length) {
      const finish = setTimeout(() => {
        setGenerating(false);
        setActiveStage(0);
        onComplete();
      }, 400);
      return () => clearTimeout(finish);
    }
    const timer = setTimeout(() => setActiveStage((stage) => stage + 1), STAGE_DURATION_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generating, activeStage]);

  return (
    <>
      <button
        type="button"
        disabled={generating}
        onClick={() => {
          setActiveStage(0);
          setGenerating(true);
        }}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#171512] px-5 text-sm font-bold text-white shadow-lg shadow-black/10 transition active:scale-[0.99] disabled:opacity-70 sm:w-auto"
      >
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        {generating ? "Generating…" : "Generate New Brand Concepts"}
      </button>

      {generating && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Generating brand concepts"
        >
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-[0_24px_60px_rgba(48,39,27,0.3)]">
            <div className="flex justify-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#171512] text-[#E1B56F]">
                <Sparkles className="h-7 w-7 animate-pulse" aria-hidden="true" />
              </span>
            </div>
            <p className="mt-4 text-center text-sm font-bold text-[#171512]">Designing your brand concepts</p>

            <div className="mt-5 flex flex-col gap-3">
              {STAGES.map((stage, index) => {
                const done = index < activeStage;
                const current = index === activeStage;
                return (
                  <div key={stage} className="flex items-center gap-3">
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition ${
                        done
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : current
                            ? "border-[#B97824] bg-[#FFF8ED]"
                            : "border-[#E7DDCF] bg-white"
                      }`}
                    >
                      {done ? (
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <span
                          className={`h-2 w-2 rounded-full transition ${current ? "animate-pulse bg-[#B97824]" : "bg-[#E7DDCF]"}`}
                        />
                      )}
                    </span>
                    <span className={`text-sm transition ${done || current ? "font-semibold text-[#171512]" : "text-[#B4A896]"}`}>
                      {stage}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
