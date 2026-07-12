"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { publishSite, rollbackSite, unpublishSite } from "@/lib/api";

export function PublishButton({ siteId }: { siteId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  async function handleClick() {
    setSubmitting(true);
    setError(null);
    setWarning(null);
    try {
      const result = await publishSite(siteId);
      if (result.warning) {
        setWarning(result.warning);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed pre-publish checks");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      {warning && <p className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{warning}</p>}
      <button
        type="button"
        onClick={handleClick}
        disabled={submitting}
        className="min-h-12 self-start rounded-2xl bg-[#171512] px-5 text-sm font-bold text-white disabled:opacity-50"
      >
        {submitting ? "Publishing…" : "Publish"}
      </button>
    </div>
  );
}

export function UnpublishButton({ siteId }: { siteId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleClick() {
    setSubmitting(true);
    try {
      await unpublishSite(siteId);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={submitting}
      className="min-h-12 self-start rounded-2xl border border-[#E7DDCF] bg-white px-4 text-sm font-bold text-[#171512] disabled:opacity-50"
    >
      {submitting ? "Unpublishing…" : "Unpublish"}
    </button>
  );
}

export function RollbackButton({ siteId, versionId }: { siteId: string; versionId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleClick() {
    setSubmitting(true);
    try {
      await rollbackSite(siteId, versionId);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={submitting}
      className="min-h-9 rounded-full border border-[#E7DDCF] bg-white px-3 py-1 text-xs font-bold text-[#171512] disabled:opacity-50"
    >
      {submitting ? "Rolling back…" : "Roll back to this release"}
    </button>
  );
}
