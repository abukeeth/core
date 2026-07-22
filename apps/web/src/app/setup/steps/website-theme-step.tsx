"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSite, setSetupStep, startGeneration, type Restaurant } from "@/lib/api";
import { primaryButtonClass, secondaryButtonClass } from "../wizard-shell";

export function WebsiteThemeStep({ onDone }: { onDone: (restaurant: Restaurant) => void }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function advance() {
    const { restaurant } = await setSetupStep("DONE");
    onDone(restaurant);
  }

  async function handleBuild() {
    setSubmitting(true);
    setError(null);
    try {
      const { site } = await createSite();
      await startGeneration(site.id);
      // Deliberately does NOT call advance()/onDone() here. advance()
      // updates this /setup page's own `restaurant` state to setupStep:
      // DONE, which re-renders this same page to <FinishStep> — whose
      // effect immediately router.replace()s to /dashboard/launch. That
      // redirect raced router.push("/dashboard/builder") below and
      // reliably won regardless of call order (router.push doesn't
      // synchronously stop this page from re-rendering first), so
      // onboarding silently finished with no generation screen ever
      // shown. Calling setSetupStep directly — still marking the wizard
      // DONE server-side — without touching local state means
      // <FinishStep> never mounts on this page at all, removing the race
      // by construction instead of by timing.
      await setSetupStep("DONE");
      router.push("/dashboard/builder");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start building your website");
      setSubmitting(false);
    }
  }

  async function handleSkip() {
    setSubmitting(true);
    setError(null);
    try {
      await advance();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">GO ONLINE</p>
      <h1 className="mt-2 text-3xl font-display font-semibold tracking-tight">Build your website</h1>
      <p className="mt-3 text-sm leading-6 text-ink-secondary">
        AI will design a customer-facing ordering website for your business. You can regenerate or customize it anytime.
      </p>

      <div className="mt-6 space-y-4">
        {error && <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</p>}

        <button type="button" onClick={handleBuild} disabled={submitting} className={primaryButtonClass}>
          {submitting ? "Starting…" : "Build my website now"}
        </button>
        <button type="button" onClick={handleSkip} disabled={submitting} className={secondaryButtonClass}>
          Skip for now
        </button>
      </div>
    </div>
  );
}
