"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { selectVariation } from "@/lib/api";

export function SelectButton({ siteId, versionId }: { siteId: string; versionId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setSubmitting(true);
    setError(null);
    try {
      await selectVariation(siteId, versionId);
      router.push("/dashboard/website/editor");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not select this variation");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
      <button
        type="button"
        onClick={handleClick}
        disabled={submitting}
        className="min-h-12 w-full rounded-2xl bg-[#171512] px-4 text-sm font-bold text-white disabled:opacity-50"
      >
        {submitting ? "Selecting…" : "Select this design"}
      </button>
    </div>
  );
}
