"use client";

import type { ReactNode } from "react";
import type { SetupStep } from "@/lib/api";

const STEP_ORDER: SetupStep[] = [
  "BUSINESS_TYPE",
  "BUSINESS_INFO",
  "LOCATION",
  "PAYMENT_PROVIDER",
  "MENU_IMPORT",
  "WEBSITE_THEME",
  "DONE",
];

const STEP_LABELS: Record<SetupStep, string> = {
  BUSINESS_TYPE: "Business type",
  BUSINESS_INFO: "Business info",
  LOCATION: "Location",
  PAYMENT_PROVIDER: "Payment",
  MENU_IMPORT: "Menu",
  WEBSITE_THEME: "Website",
  DONE: "Finish",
};

export function stepIndex(step: SetupStep): number {
  return STEP_ORDER.indexOf(step);
}

export function WizardShell({ step, children }: { step: SetupStep; children: ReactNode }) {
  const currentIndex = stepIndex(step);

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-[#F7F0E5] px-4 py-8 text-[#171512] sm:px-6">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-6 flex items-center justify-between">
          <div className="text-xl font-bold tracking-tight text-[#B97824]">OrderVora</div>
          <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#756B5D] shadow-sm">
            Step {currentIndex + 1} of {STEP_ORDER.length}
          </span>
        </div>

        <div className="mb-6 flex gap-1.5">
          {STEP_ORDER.map((s, i) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full ${i <= currentIndex ? "bg-[#B97824]" : "bg-[#E7DDCF]"}`}
              aria-label={STEP_LABELS[s]}
            />
          ))}
        </div>

        <section className="rounded-[28px] border border-[#E7DDCF] bg-white p-5 shadow-[0_18px_50px_rgba(48,39,27,0.07)] sm:p-7">
          {children}
        </section>
      </div>
    </main>
  );
}

export const inputClass =
  "mt-2 min-h-14 w-full rounded-2xl border border-[#E7DDCF] bg-[#FFFDF9] px-4 text-base outline-none transition focus:border-[#B97824] focus:ring-4 focus:ring-[#B97824]/10";

export const primaryButtonClass =
  "flex min-h-14 w-full items-center justify-center rounded-2xl bg-[#171512] px-5 text-base font-bold text-white shadow-lg shadow-black/10 transition active:scale-[0.99] disabled:opacity-50";

export const secondaryButtonClass =
  "flex min-h-14 w-full items-center justify-center rounded-2xl border border-[#E7DDCF] bg-white px-5 text-base font-bold text-[#171512] transition active:scale-[0.99] disabled:opacity-50";
