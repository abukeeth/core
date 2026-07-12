"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { applySuggestion, runScore, type Suggestion } from "@/lib/api";

export function RescoreButton({ siteId, versionId }: { siteId: string; versionId: string }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);

  async function handleClick() {
    setRunning(true);
    try {
      await runScore(siteId, versionId);
      router.refresh();
    } finally {
      setRunning(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={running}
      className="self-start rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-black disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-50"
    >
      {running ? "Re-scoring…" : "Re-score"}
    </button>
  );
}

export function SuggestionRow({ siteId, versionId, suggestion }: { siteId: string; versionId: string; suggestion: Suggestion }) {
  const router = useRouter();
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApply() {
    setApplying(true);
    setError(null);
    try {
      await applySuggestion(siteId, versionId, suggestion);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not apply fix");
    } finally {
      setApplying(false);
    }
  }

  const impactColor =
    suggestion.impact === "high" ? "text-red-600" : suggestion.impact === "medium" ? "text-amber-600" : "text-zinc-500";

  return (
    <li className="flex flex-col gap-1 rounded border border-black/[.08] p-3 dark:border-white/[.145]">
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-medium uppercase ${impactColor}`}>{suggestion.impact} impact</span>
        <span className="text-xs text-zinc-500 dark:text-zinc-500">{suggestion.dimension}</span>
      </div>
      <p className="text-sm text-black dark:text-zinc-50">{suggestion.issue}</p>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{suggestion.suggestion}</p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {suggestion.autoFixKind && (
        <button
          type="button"
          onClick={handleApply}
          disabled={applying}
          className="mt-1 self-start rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background disabled:opacity-50"
        >
          {applying ? "Applying…" : "Auto-fix"}
        </button>
      )}
    </li>
  );
}
