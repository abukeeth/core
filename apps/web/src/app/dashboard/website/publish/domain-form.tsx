"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { addDomain, setPrimaryDomain, verifyDomain, type SiteDomain } from "@/lib/api";

export function DomainForm({ siteId }: { siteId: string }) {
  const router = useRouter();
  const [hostname, setHostname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await addDomain(siteId, hostname.trim());
      setHostname("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add domain");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      <input
        type="text"
        value={hostname}
        onChange={(e) => setHostname(e.target.value)}
        placeholder="menu.yourrestaurant.com"
        className="min-h-11 flex-1 rounded-xl border border-[#E7DDCF] bg-white px-3 text-sm text-[#171512] outline-none focus:border-[#B97824]"
      />
      <button
        type="submit"
        disabled={submitting}
        className="min-h-11 rounded-xl bg-[#171512] px-4 text-sm font-bold text-white disabled:opacity-50"
      >
        {submitting ? "Adding…" : "Add domain"}
      </button>
    </form>
  );
}

export function DomainRow({ siteId, domain }: { siteId: string; domain: SiteDomain }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleVerify() {
    setBusy(true);
    try {
      await verifyDomain(siteId, domain.id);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleSetPrimary() {
    setBusy(true);
    try {
      await setPrimaryDomain(siteId, domain.id);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-[#E7DDCF] bg-[#FFFDF9] p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="break-all font-mono text-[#171512]">
          {domain.hostname} {domain.isPrimary && <span className="font-sans text-xs font-bold text-emerald-700">(primary)</span>}
        </p>
        <p className="text-xs text-[#8A7D6C]">
          DNS: {domain.verificationStatus} · TLS: {domain.tlsStatus}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        {domain.verificationStatus !== "VERIFIED" && (
          <button type="button" onClick={handleVerify} disabled={busy} className="min-h-9 rounded-full border border-[#E7DDCF] bg-white px-3 py-1 text-xs font-bold text-[#171512]">
            Check DNS
          </button>
        )}
        {domain.verificationStatus === "VERIFIED" && !domain.isPrimary && (
          <button type="button" onClick={handleSetPrimary} disabled={busy} className="min-h-9 rounded-full border border-[#E7DDCF] bg-white px-3 py-1 text-xs font-bold text-[#171512]">
            Make primary
          </button>
        )}
      </div>
    </li>
  );
}
