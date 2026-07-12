"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, ExternalLink, QrCode, Share2 } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import type { SiteStatus } from "@/lib/api";

export function CurrentWebsiteCard({ domain, status }: { domain: string; status: SiteStatus | null }) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const isLive = status === "PUBLISHED" || status === "REPUBLISHING";

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(domain);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied by the browser — the button simply
      // won't show the "Copied!" confirmation; nothing else depends on it.
    }
  }

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: "My website", url: domain });
      } catch {
        // User cancelled the native share sheet — no error state needed.
      }
    } else {
      await handleCopy();
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">CURRENT WEBSITE</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="truncate font-mono text-base font-semibold text-[#171512] sm:text-lg">{domain}</p>
            <Badge tone={isLive ? "success" : "neutral"}>{isLive ? "Live" : "Preview domain"}</Badge>
          </div>
          <p className="mt-1 text-sm text-[#756B5D]">
            {isLive ? "Your ordering site is live at this address." : "Your live ordering site will publish to this address."}
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <a
          href={domain}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#171512] px-4 text-sm font-bold text-white transition active:scale-[0.99]"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          Open Website
        </a>
        <button
          type="button"
          onClick={handleCopy}
          className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#E7DDCF] bg-white px-4 text-sm font-bold text-[#171512] transition active:scale-[0.99]"
        >
          <Copy className="h-4 w-4" aria-hidden="true" />
          {copied ? "Copied!" : "Copy Link"}
        </button>
        <button
          type="button"
          onClick={handleShare}
          className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#E7DDCF] bg-white px-4 text-sm font-bold text-[#171512] transition active:scale-[0.99]"
        >
          <Share2 className="h-4 w-4" aria-hidden="true" />
          Share
        </button>
        <button
          type="button"
          onClick={() => setShowQr((v) => !v)}
          aria-expanded={showQr}
          className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-bold transition active:scale-[0.99] ${
            showQr ? "border-[#171512] bg-[#171512] text-white" : "border-[#E7DDCF] bg-white text-[#171512]"
          }`}
        >
          <QrCode className="h-4 w-4" aria-hidden="true" />
          QR Code
        </button>
      </div>

      {showQr && (
        <div className="mt-5 flex justify-center rounded-2xl border border-[#E7DDCF] bg-[#FBF7F1] p-6">
          <div className="rounded-2xl border border-[#E7DDCF] bg-white p-4">
            <QRCodeSVG value={domain} size={160} />
          </div>
        </div>
      )}
    </Card>
  );
}
