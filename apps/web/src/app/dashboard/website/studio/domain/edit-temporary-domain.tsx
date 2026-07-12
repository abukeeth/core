"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateSite } from "@/lib/api";

function extractSlug(domain: string): string {
  const hostname = domain.replace(/^https?:\/\//, "");
  return hostname.split(".")[0] ?? "";
}

export function EditTemporaryDomain({ siteId, current, onDone }: { siteId: string; current: string; onDone: () => void }) {
  const router = useRouter();
  const [value, setValue] = useState(extractSlug(current));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSave() {
    const slug = value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/(^-+|-+$)/g, "");
    if (!slug) {
      setError("Enter a name for your temporary domain.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await updateSite(siteId, { slug });
      router.refresh();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update the temporary domain.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-2">
      <div className="flex items-center overflow-hidden rounded-xl border border-[#E7DDCF] bg-white focus-within:border-[#B97824]">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="min-h-10 min-w-0 flex-1 bg-transparent px-3 font-mono text-sm text-[#171512] outline-none"
          autoFocus
        />
        <span className="shrink-0 pr-3 font-mono text-xs text-[#8A7D6C]">.ordervora.app</span>
      </div>
      {error && <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={submitting}
          className="min-h-9 rounded-full bg-[#171512] px-3 text-xs font-bold text-white disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={submitting}
          className="min-h-9 rounded-full border border-[#E7DDCF] bg-white px-3 text-xs font-bold text-[#171512] disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
