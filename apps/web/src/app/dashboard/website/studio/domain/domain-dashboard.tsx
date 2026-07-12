"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, Globe2, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { removeDomain, setPrimaryDomain, verifyDomain, type SiteDomain, type SiteStatus } from "@/lib/api";
import { ConnectDomainWizard } from "./connect-domain-wizard";
import { EditTemporaryDomain } from "./edit-temporary-domain";
import { formatLastChecked, TLS_LABEL, TLS_TONE, VERIFICATION_LABEL, VERIFICATION_TONE } from "./format";

interface DomainDashboardProps {
  siteId: string | null;
  siteStatus: SiteStatus | null;
  temporaryDomain: string;
  primaryUrl: string;
  domains: SiteDomain[];
}

export function DomainDashboard({ siteId, siteStatus, temporaryDomain, primaryUrl, domains }: DomainDashboardProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [editingTemporary, setEditingTemporary] = useState(false);
  const [busyDomainId, setBusyDomainId] = useState<string | null>(null);

  const primaryCustomDomain = domains.find((d) => d.isPrimary && d.verificationStatus === "VERIFIED");
  const isTemporaryPrimary = !primaryCustomDomain;
  const canEditTemporary = siteStatus === "DRAFT" || siteStatus === null;

  async function handleCopy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied by the browser — no error state needed.
    }
  }

  async function handleVerify(domainId: string) {
    if (!siteId) return;
    setBusyDomainId(domainId);
    try {
      await verifyDomain(siteId, domainId);
      router.refresh();
    } finally {
      setBusyDomainId(null);
    }
  }

  async function handleMakePrimary(domainId: string) {
    if (!siteId) return;
    setBusyDomainId(domainId);
    try {
      await setPrimaryDomain(siteId, domainId);
      router.refresh();
    } finally {
      setBusyDomainId(null);
    }
  }

  async function handleRemove(domainId: string) {
    if (!siteId) return;
    setBusyDomainId(domainId);
    try {
      await removeDomain(siteId, domainId);
      router.refresh();
    } finally {
      setBusyDomainId(null);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Globe2 className="h-4 w-4 text-[#9A6A2F]" aria-hidden="true" />
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">DOMAIN MANAGEMENT</p>
        </div>
        <button
          type="button"
          onClick={() => setShowWizard(true)}
          disabled={!siteId}
          className="flex min-h-9 items-center gap-1.5 rounded-full bg-[#171512] px-4 text-xs font-bold text-white transition active:scale-[0.99] disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Connect Domain
        </button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-[#B97824]/30 bg-[#FFF8ED] p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#9A6A2F]">Primary Domain</p>
            {isTemporaryPrimary ? <Badge tone="neutral">Temporary</Badge> : <Badge tone="success">Custom</Badge>}
          </div>
          <p className="mt-2 truncate font-mono text-sm font-semibold text-[#171512]">
            {isTemporaryPrimary ? temporaryDomain.replace(/^https?:\/\//, "") : primaryCustomDomain!.hostname}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={primaryUrl}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-9 items-center gap-1.5 rounded-full border border-[#E7DDCF] bg-white px-3 text-xs font-bold text-[#171512]"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              Visit
            </a>
            <button
              type="button"
              onClick={() => handleCopy(primaryUrl)}
              className="flex min-h-9 items-center gap-1.5 rounded-full border border-[#E7DDCF] bg-white px-3 text-xs font-bold text-[#171512]"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-[#E7DDCF] bg-[#FBF7F1] p-4">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#9A6A2F]">Temporary Domain</p>
          {editingTemporary && siteId ? (
            <EditTemporaryDomain siteId={siteId} current={temporaryDomain} onDone={() => setEditingTemporary(false)} />
          ) : (
            <>
              <p className="mt-2 truncate font-mono text-sm font-semibold text-[#171512]">{temporaryDomain.replace(/^https?:\/\//, "")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleCopy(temporaryDomain)}
                  className="flex min-h-9 items-center gap-1.5 rounded-full border border-[#E7DDCF] bg-white px-3 text-xs font-bold text-[#171512]"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  Copy
                </button>
                {canEditTemporary && siteId && (
                  <button
                    type="button"
                    onClick={() => setEditingTemporary(true)}
                    className="flex min-h-9 items-center gap-1.5 rounded-full border border-[#E7DDCF] bg-white px-3 text-xs font-bold text-[#171512]"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    Change
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {domains.length > 0 && (
        <div className="mt-5 flex flex-col gap-2">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#9A6A2F]">Additional Domains</p>
          <ul className="flex flex-col gap-2">
            {domains.map((domain) => {
              const busy = busyDomainId === domain.id;
              return (
                <li key={domain.id} className="flex flex-col gap-3 rounded-2xl border border-[#E7DDCF] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-mono text-sm font-semibold text-[#171512]">{domain.hostname}</p>
                      {domain.isPrimary && domain.verificationStatus === "VERIFIED" && <Badge tone="success">Primary</Badge>}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[#756B5D]">
                      <span className="inline-flex items-center gap-1">
                        DNS: <Badge tone={VERIFICATION_TONE[domain.verificationStatus]}>{VERIFICATION_LABEL[domain.verificationStatus]}</Badge>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                        SSL: <Badge tone={TLS_TONE[domain.tlsStatus]}>{TLS_LABEL[domain.tlsStatus]}</Badge>
                      </span>
                      <span>Last checked: {formatLastChecked(domain.lastCheckedAt)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {domain.verificationStatus !== "VERIFIED" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleVerify(domain.id)}
                        className="min-h-9 rounded-full border border-[#E7DDCF] bg-white px-3 text-xs font-bold text-[#171512] disabled:opacity-50"
                      >
                        {busy ? "Checking…" : "Check DNS"}
                      </button>
                    )}
                    {domain.verificationStatus === "VERIFIED" && !domain.isPrimary && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleMakePrimary(domain.id)}
                        className="min-h-9 rounded-full border border-[#E7DDCF] bg-white px-3 text-xs font-bold text-[#171512] disabled:opacity-50"
                      >
                        Make primary
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleRemove(domain.id)}
                      className="flex min-h-9 items-center gap-1 rounded-full border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-700 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {showWizard && siteId && <ConnectDomainWizard siteId={siteId} onClose={() => setShowWizard(false)} />}
    </Card>
  );
}
