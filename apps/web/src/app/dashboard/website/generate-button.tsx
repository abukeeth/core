"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSite, regenerateVariations, startGeneration } from "@/lib/api";

export function GenerateButton({ siteId, mode }: { siteId?: string; mode: "create" | "regenerate" }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setSubmitting(true);
    setError(null);
    try {
      let targetSiteId = siteId;
      if (mode === "create") {
        const { site } = await createSite();
        targetSiteId = site.id;
        await startGeneration(site.id);
      } else if (targetSiteId) {
        await regenerateVariations(targetSiteId);
      }
      router.push("/dashboard/website/variations");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        onClick={handleClick}
        disabled={submitting}
        className="self-start rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {submitting ? "Starting…" : mode === "create" ? "Generate my website" : "Regenerate variations"}
      </button>
    </div>
  );
}
