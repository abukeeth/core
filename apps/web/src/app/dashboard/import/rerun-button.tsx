"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { rerunImportJob } from "@/lib/api";

export function RerunButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRerun() {
    setError(null);
    setSubmitting(true);
    try {
      await rerunImportJob(jobId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rerun import");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        type="button"
        onClick={handleRerun}
        disabled={submitting}
        className="rounded-full border border-black/[.08] px-3 py-1 text-xs disabled:opacity-50 dark:border-white/[.145]"
      >
        {submitting ? "Rerunning..." : "Rerun"}
      </button>
    </span>
  );
}
