"use client";

import confetti from "canvas-confetti";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { DashboardDrawer } from "@/components/dashboard-drawer";
import { DevicePreview } from "../website/variations/[id]/device-preview";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";

const CHIME_PREF_KEY = "ordervora.builder.chimeEnabled";

function fireConfetti() {
  const duration = 1500;
  const end = Date.now() + duration;

  (function frame() {
    confetti({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0 } });
    confetti({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1 } });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

/** A short three-note success chime, synthesized with Web Audio — no audio asset needed, and silently a no-op if unavailable. */
function playChime() {
  try {
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;
    [523.25, 659.25, 784.0].forEach((freq, i) => {
      const start = now + i * 0.12;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.5);
    });
  } catch {
    // Web Audio unavailable in this browser — the chime is a nice-to-have, never a hard requirement.
  }
}

export function FinaleReveal({
  restaurantName,
  siteId,
  siteSlug,
  publishedVersionId,
  qrToken,
  qrError,
}: {
  restaurantName: string;
  siteId: string;
  siteSlug: string;
  publishedVersionId: string | null;
  qrToken: string | null;
  qrError: string | null;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const qrContainerRef = useRef<HTMLDivElement>(null);
  const orderUrl = qrToken && typeof window !== "undefined" ? `${window.location.origin}/order/qr/${qrToken}` : null;
  const [chimeEnabled, setChimeEnabled] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem(CHIME_PREF_KEY) === "on",
  );

  useEffect(() => {
    if (!reducedMotion) fireConfetti();
    if (typeof window !== "undefined" && window.localStorage.getItem(CHIME_PREF_KEY) === "on") playChime();
  }, [reducedMotion]);

  function handleToggleChime() {
    const next = !chimeEnabled;
    setChimeEnabled(next);
    window.localStorage.setItem(CHIME_PREF_KEY, next ? "on" : "off");
    if (next) playChime();
  }

  function handleDownloadQr() {
    const svg = qrContainerRef.current?.querySelector("svg");
    if (!svg) return;
    const blob = new Blob([svg.outerHTML], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${siteSlug}-qr-code.svg`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex min-h-screen w-full flex-1 flex-col items-center gap-8 overflow-x-hidden bg-[#F7F0E5] px-4 pb-28 pt-8 text-[#171512] sm:px-6 lg:p-10">
      <div className="w-full">
        <DashboardDrawer />
      </div>
      <div className="flex w-full max-w-3xl flex-col items-center gap-2 text-center">
        <button
          type="button"
          onClick={handleToggleChime}
          className="min-h-9 self-end rounded-full border border-[#E7DDCF] bg-white px-3 py-1 text-[11px] font-semibold text-[#756B5D]"
        >
          {chimeEnabled ? "🔔 Sound on" : "🔕 Sound off"}
        </button>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">YOU&apos;RE LIVE</p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          🎉 {restaurantName} is officially open for business
        </h1>
        <p className="max-w-xl text-sm leading-6 text-[#756B5D]">
          You didn&apos;t just get a website — you launched a real business. Customers can find you, browse your
          menu, and order from you, starting right now.
        </p>
      </div>

      <div className="grid w-full max-w-3xl grid-cols-1 gap-5 md:grid-cols-2">
        <div className="rounded-3xl border border-[#E7DDCF] bg-white p-4 shadow-[0_12px_36px_rgba(48,39,27,0.04)] sm:p-5">
          <h2 className="text-sm font-bold">Your new home online</h2>
          <div className="mt-3">
            {publishedVersionId ? (
              <DevicePreview siteId={siteId} variationId={publishedVersionId} />
            ) : (
              <p className="text-sm text-[#756B5D]">Preview unavailable right now.</p>
            )}
          </div>
          <p className="mt-3 text-xs text-[#8A7D6C]">
            Live at <span className="font-mono">{siteSlug}.sites.ordervora.example</span>
          </p>
        </div>

        <div className="rounded-3xl border border-[#E7DDCF] bg-white p-4 shadow-[0_12px_36px_rgba(48,39,27,0.04)] sm:p-5">
          <h2 className="text-sm font-bold">Start taking orders today</h2>
          {orderUrl ? (
            <div ref={qrContainerRef} className="mt-3 flex flex-col items-center gap-3 rounded-2xl border border-[#E7DDCF] bg-[#FFFDF9] p-6">
              <QRCodeSVG value={orderUrl} size={180} />
              <p className="text-center text-xs text-[#756B5D]">
                Print this at your counter or tables — every scan becomes an order.
              </p>
              <button
                type="button"
                onClick={handleDownloadQr}
                className="min-h-10 rounded-full border border-[#E7DDCF] bg-white px-4 text-xs font-bold text-[#171512]"
              >
                Download QR code
              </button>
            </div>
          ) : (
            <p className="mt-3 text-sm text-[#756B5D]">
              {qrError
                ? "Your QR code isn't ready yet — no worries, you can create one anytime from Tables."
                : "Setting up your QR code…"}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-3">
        <Link
          href="/dashboard/website"
          className="min-h-14 rounded-full bg-[#171512] px-8 py-3 text-base font-bold text-white shadow-lg shadow-black/10 active:scale-[0.99]"
        >
          Open My Restaurant
        </Link>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/dashboard/tables"
            className="min-h-11 rounded-full border border-[#E7DDCF] bg-white px-5 py-2 text-sm font-bold text-[#171512]"
          >
            Manage QR codes
          </Link>
          <Link href="/dashboard" className="px-5 py-2 text-sm font-semibold text-[#756B5D] underline-offset-4 hover:underline">
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
