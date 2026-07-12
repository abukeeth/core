"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Globe2, Loader2, ShieldCheck, X } from "lucide-react";
import { addDomain, listDomainHistory, listDomains, setPrimaryDomain, verifyDomain, type SiteDomain } from "@/lib/api";

const HOSTNAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

type Step = "enter" | "validating" | "records" | "verifying" | "generating" | "active" | "error";

export function ConnectDomainWizard({ siteId, onClose }: { siteId: string; onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("enter");
  const [hostname, setHostname] = useState("");
  const [domain, setDomain] = useState<SiteDomain | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function handleCopy(field: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Clipboard access can be denied by the browser — no error state needed.
    }
  }

  async function handleSubmitHostname() {
    const trimmed = hostname.trim().toLowerCase();
    setError(null);
    if (!HOSTNAME_PATTERN.test(trimmed)) {
      setError("Enter a valid domain, like menu.yourrestaurant.com.");
      return;
    }
    setStep("validating");
    try {
      const { domain: created } = await addDomain(siteId, trimmed);
      setDomain(created);
      setStep("records");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't connect that domain.");
      setStep("enter");
    }
  }

  async function handleVerify() {
    if (!domain) return;
    setStep("verifying");
    setError(null);
    try {
      const { domain: updated } = await verifyDomain(siteId, domain.id);
      setDomain(updated);
      if (updated.verificationStatus === "VERIFIED") {
        setStep("generating");
      } else {
        const { events } = await listDomainHistory(siteId);
        const failure = events.find((e) => e.domainId === domain.id && e.type === "VERIFICATION_FAILED");
        setError(failure?.message ?? "DNS verification failed — double-check the records below, then try again.");
        setStep("records");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't verify DNS right now.");
      setStep("records");
    }
  }

  async function handleCheckSslStatus() {
    if (!domain) return;
    setChecking(true);
    try {
      const { domains } = await listDomains(siteId);
      const latest = domains.find((d) => d.id === domain.id);
      if (latest) {
        setDomain(latest);
        if (latest.tlsStatus === "ACTIVE") setStep("active");
      }
    } finally {
      setChecking(false);
    }
  }

  async function handleMakePrimary() {
    if (!domain) return;
    await setPrimaryDomain(siteId, domain.id);
    router.refresh();
    onClose();
  }

  function handleFinish() {
    router.refresh();
    onClose();
  }

  const cnameRecord = domain?.dnsRecords.find((r) => r.type === "CNAME");
  const txtRecord = domain?.dnsRecords.find((r) => r.type === "TXT");

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Connect a custom domain">
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-[0_24px_60px_rgba(48,39,27,0.3)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#171512] text-[#E1B56F]">
              <Globe2 className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="text-sm font-bold text-[#171512]">Connect a custom domain</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full text-[#8A7D6C] hover:bg-[#F7F0E5]">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {(step === "enter" || step === "validating") && (
          <div className="mt-5">
            <label className="text-xs font-bold uppercase tracking-[0.1em] text-[#9A6A2F]">Your domain</label>
            <input
              type="text"
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              placeholder="menu.yourrestaurant.com"
              className="mt-2 min-h-11 w-full rounded-xl border border-[#E7DDCF] bg-white px-3 text-sm text-[#171512] outline-none focus:border-[#B97824]"
              autoFocus
            />
            {error && <p className="mt-2 text-sm font-medium text-red-600">{error}</p>}
            <button
              type="button"
              onClick={handleSubmitHostname}
              disabled={step === "validating" || !hostname.trim()}
              className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#171512] px-4 text-sm font-bold text-white disabled:opacity-50"
            >
              {step === "validating" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Validating…
                </>
              ) : (
                "Continue"
              )}
            </button>
          </div>
        )}

        {(step === "records" || step === "verifying") && domain && cnameRecord && txtRecord && (
          <div className="mt-5">
            <p className="text-sm text-[#756B5D]">Add these two records at your DNS provider, then verify.</p>
            {error && <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

            <div className="mt-3 flex flex-col gap-2">
              <DnsRecordRow label="CNAME" name={cnameRecord.name} value={cnameRecord.value} copiedField={copiedField} onCopy={handleCopy} />
              <DnsRecordRow label="TXT" name={txtRecord.name} value={txtRecord.value} copiedField={copiedField} onCopy={handleCopy} />
            </div>

            <p className="mt-3 text-xs text-[#8A7D6C]">DNS changes can take a few minutes (sometimes longer) to propagate.</p>

            <button
              type="button"
              onClick={handleVerify}
              disabled={step === "verifying"}
              className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#171512] px-4 text-sm font-bold text-white disabled:opacity-50"
            >
              {step === "verifying" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Verifying DNS…
                </>
              ) : (
                "Verify DNS"
              )}
            </button>
          </div>
        )}

        {step === "generating" && domain && (
          <div className="mt-5 flex flex-col items-center text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFF8ED] text-[#B97824]">
              <ShieldCheck className="h-7 w-7" aria-hidden="true" />
            </span>
            <p className="mt-3 text-sm font-bold text-[#171512]">DNS verified — issuing your SSL certificate</p>
            <p className="mt-1 text-sm text-[#756B5D]">This usually finishes within a minute. You can check back here anytime.</p>
            <div className="mt-4 flex w-full gap-2">
              <button
                type="button"
                onClick={handleCheckSslStatus}
                disabled={checking}
                className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-[#E7DDCF] bg-white px-4 text-sm font-bold text-[#171512] disabled:opacity-50"
              >
                {checking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : "Check status"}
              </button>
              <button type="button" onClick={handleFinish} className="flex min-h-11 flex-1 items-center justify-center rounded-xl bg-[#171512] px-4 text-sm font-bold text-white">
                Check back later
              </button>
            </div>
          </div>
        )}

        {step === "active" && domain && (
          <div className="mt-5 flex flex-col items-center text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <Check className="h-7 w-7" aria-hidden="true" />
            </span>
            <p className="mt-3 text-sm font-bold text-[#171512]">{domain.hostname} is active</p>
            <p className="mt-1 text-sm text-[#756B5D]">DNS verified and SSL is live. Make it your primary domain whenever you&apos;re ready.</p>
            <div className="mt-4 flex w-full gap-2">
              <button
                type="button"
                onClick={handleFinish}
                className="flex min-h-11 flex-1 items-center justify-center rounded-xl border border-[#E7DDCF] bg-white px-4 text-sm font-bold text-[#171512]"
              >
                Not yet
              </button>
              <button type="button" onClick={handleMakePrimary} className="flex min-h-11 flex-1 items-center justify-center rounded-xl bg-[#171512] px-4 text-sm font-bold text-white">
                Set as primary
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DnsRecordRow({
  label,
  name,
  value,
  copiedField,
  onCopy,
}: {
  label: string;
  name: string;
  value: string;
  copiedField: string | null;
  onCopy: (field: string, value: string) => void;
}) {
  return (
    <div className="rounded-xl border border-[#E7DDCF] bg-[#FBF7F1] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#9A6A2F]">{label}</span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate font-mono text-xs text-[#171512]">{name}</p>
        <button
          type="button"
          onClick={() => onCopy(`${label}-name`, name)}
          className="shrink-0 rounded-full p-1.5 text-[#8A7D6C] hover:bg-white"
          aria-label={`Copy ${label} record name`}
        >
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate font-mono text-xs font-semibold text-[#171512]">{value}</p>
        <button
          type="button"
          onClick={() => onCopy(`${label}-value`, value)}
          className="shrink-0 rounded-full p-1.5 text-[#8A7D6C] hover:bg-white"
          aria-label={`Copy ${label} record value`}
        >
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      {(copiedField === `${label}-name` || copiedField === `${label}-value`) && <p className="mt-1 text-[10px] font-bold text-emerald-700">Copied!</p>}
    </div>
  );
}
