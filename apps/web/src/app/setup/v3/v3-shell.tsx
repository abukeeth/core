"use client";

import type { ReactNode } from "react";

/** The three visible stages of Onboarding V3. `build` covers generate → review → live. */
export type V3Stage = "create" | "review" | "build";

const STAGE_ORDER: V3Stage[] = ["create", "review", "build"];
const STAGE_LABELS: Record<V3Stage, string> = {
  create: "Create",
  review: "Review",
  build: "Go live",
};

/**
 * Shared chrome for the Onboarding V3 screens — the same warm cream/gold token
 * card as the legacy WizardShell, but a 3-step tracker instead of 7. Mobile
 * first: a single centered column that never exceeds the readable width.
 */
export function V3Shell({ stage, children }: { stage: V3Stage; children: ReactNode }) {
  const currentIndex = STAGE_ORDER.indexOf(stage);

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-canvas px-4 py-8 text-ink sm:px-6">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-6 flex items-center justify-between">
          <div className="text-xl font-bold tracking-tight text-brand">OrderVora</div>
          <span className="rounded-full bg-surface px-3 py-1.5 text-xs font-semibold text-ink-secondary shadow-sm">
            Step {currentIndex + 1} of {STAGE_ORDER.length}
          </span>
        </div>

        <div className="mb-6 flex gap-1.5">
          {STAGE_ORDER.map((s, i) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full ${i <= currentIndex ? "bg-brand" : "bg-line"}`}
              aria-label={STAGE_LABELS[s]}
            />
          ))}
        </div>

        <section className="rounded-[24px] border border-line bg-surface p-5 shadow-[var(--ov-elevation)] sm:p-7">
          {children}
        </section>
      </div>
    </main>
  );
}
