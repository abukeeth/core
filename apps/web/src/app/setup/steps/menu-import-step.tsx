"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createImportJob, setSetupStep, type Restaurant } from "@/lib/api";
import { primaryButtonClass, secondaryButtonClass } from "../wizard-shell";

export function MenuImportStep({ onDone }: { onDone: (restaurant: Restaurant) => void }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function advance() {
    const { restaurant } = await setSetupStep("WEBSITE_THEME");
    onDone(restaurant);
  }

  async function handleImport() {
    if (!file) return;
    setSubmitting(true);
    setError(null);
    try {
      const sourceType = file.type === "application/pdf" ? "PDF" : "IMAGE";
      const { job } = await createImportJob(sourceType, { file });
      await advance();
      router.push(`/dashboard/import/${job.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
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
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">BUILD YOUR MENU</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Import your menu</h1>
      <p className="mt-3 text-sm leading-6 text-[#756B5D]">
        Upload a photo or PDF of your menu and AI will build it for you, or skip and add items manually later.
      </p>

      <div className="mt-6 space-y-4">
        {error && <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</p>}

        <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#E7DDCF] bg-[#FBF7F1] px-4 text-center text-sm font-semibold text-[#756B5D]">
          <input
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file ? file.name : "Tap to choose a menu photo or PDF"}
        </label>

        <button type="button" onClick={handleImport} disabled={submitting || !file} className={primaryButtonClass}>
          {submitting ? "Uploading…" : "Import menu"}
        </button>
        <button type="button" onClick={handleSkip} disabled={submitting} className={secondaryButtonClass}>
          Skip for now
        </button>
      </div>
    </div>
  );
}
