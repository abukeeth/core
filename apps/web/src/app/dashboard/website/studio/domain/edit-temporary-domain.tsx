"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateSite } from "@/lib/api";

/**
 * §M — `current` is the real API-returned temporary domain, which today is
 * `https://<FRONTEND_URL>/store/<slug>` (the pre-wildcard-DNS fallback) and
 * will become `https://<slug>.<PLATFORM_DOMAIN>` once SITE_WILDCARD_DNS_ACTIVE
 * is flipped on — the slug's *position* in the string differs between the
 * two (path-suffix vs. subdomain-prefix). Locating the slug as a substring,
 * rather than assuming either fixed shape, keeps this editable-slug input
 * correct across both without needing to know which mode is active.
 */
function splitAroundSlug(current: string, slug: string): { before: string; after: string } {
  const withoutScheme = current.replace(/^https?:\/\//, "");
  const idx = withoutScheme.indexOf(slug);
  if (idx === -1) return { before: withoutScheme, after: "" };
  return { before: withoutScheme.slice(0, idx), after: withoutScheme.slice(idx + slug.length) };
}

/** Best-effort guess at the current slug for the input's initial value — the fixed before/after text around it is recomputed from the real `current` string once the owner starts typing, not assumed from a hardcoded suffix. */
function guessSlug(current: string): string {
  const withoutScheme = current.replace(/^https?:\/\//, "");
  const storeMatch = withoutScheme.match(/\/store\/([^/?#]+)/);
  if (storeMatch) return storeMatch[1] ?? "";
  return withoutScheme.split(".")[0] ?? "";
}

export function EditTemporaryDomain({ siteId, current, onDone }: { siteId: string; current: string; onDone: () => void }) {
  const router = useRouter();
  const initialSlug = guessSlug(current);
  const { before, after } = splitAroundSlug(current, initialSlug);
  const [value, setValue] = useState(initialSlug);
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
        {before && <span className="shrink-0 truncate pl-3 font-mono text-xs text-[#8A7D6C]">{before}</span>}
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="min-h-10 min-w-0 flex-1 bg-transparent px-3 font-mono text-sm text-[#171512] outline-none"
          autoFocus
        />
        {after && <span className="shrink-0 pr-3 font-mono text-xs text-[#8A7D6C]">{after}</span>}
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
