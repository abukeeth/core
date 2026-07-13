"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { PageShell } from "@/components/ui";
import type { Restaurant, SiteStatus } from "@/lib/api";

function LinkRow({ label, href, external }: { label: string; href: string; external?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#E7DDCF] bg-[#FBF7F1] px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-bold text-[#171512]">{label}</p>
        <p className="truncate text-xs text-[#8A7D6C]">{href}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-full border border-[#E7DDCF] bg-white px-3 py-1.5 text-xs font-bold text-[#171512]"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
        <a
          href={href}
          target={external ? "_blank" : undefined}
          rel={external ? "noreferrer" : undefined}
          className="rounded-full bg-[#171512] px-3 py-1.5 text-xs font-bold text-white"
        >
          Open
        </a>
      </div>
    </div>
  );
}

export function LaunchCenter({ restaurant, siteStatus }: { restaurant: Restaurant; siteStatus: SiteStatus | null }) {
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    // window is unavailable at SSR time, so reading it into render-affecting
    // state necessarily happens in an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
  }, []);

  const websiteUrl = `${origin}/order/${restaurant.id}`;
  const kitchenUrl = `${origin}/dashboard/kitchen`;
  const dashboardUrl = `${origin}/dashboard`;
  const isLive = siteStatus === "PUBLISHED" || siteStatus === "REPUBLISHING";

  // §10 — Live status, the published URL, the QR code, and Test Order must
  // never be shown until the website has actually finished publishing
  // successfully, regardless of how far the owner otherwise got through
  // setup — "Business Ready" claimed unconditionally here previously, with
  // no reference to the real Site.status at all.
  if (!isLive) {
    return (
      <PageShell maxWidth="lg">
        <section className="rounded-[28px] border border-[#E7DDCF] bg-white p-5 shadow-[0_18px_50px_rgba(48,39,27,0.07)] sm:p-7">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">NOT LIVE YET</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{restaurant.name} isn&apos;t published yet.</h1>
          <p className="mt-3 text-sm leading-6 text-[#756B5D]">
            Finish building and publishing your website first — your QR code, ordering link, and test order flow will
            appear here once it&apos;s live.
          </p>
          <Link
            href="/dashboard/website"
            className="mt-6 flex min-h-14 w-full items-center justify-center rounded-2xl bg-[#171512] px-5 text-base font-bold text-white shadow-lg shadow-black/10 transition active:scale-[0.99]"
          >
            Go to Website Studio
          </Link>
          <Link
            href="/dashboard"
            className="mt-3 flex min-h-14 w-full items-center justify-center rounded-2xl border border-[#E7DDCF] bg-white px-5 text-base font-bold text-[#171512] transition active:scale-[0.99]"
          >
            Go to dashboard
          </Link>
        </section>
      </PageShell>
    );
  }

  return (
    <PageShell maxWidth="lg">
        <section className="rounded-[28px] border border-[#E7DDCF] bg-white p-5 shadow-[0_18px_50px_rgba(48,39,27,0.07)] sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">YOU&apos;RE LIVE</p>
            <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 shadow-sm">
              Business Ready
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{restaurant.name} is ready to take orders.</h1>
          <p className="mt-3 text-sm leading-6 text-[#756B5D]">
            Share your ordering link, print the QR code for tables or receipts, and run a test order before you go live.
          </p>

          <div className="mt-6 flex justify-center">
            <div className="rounded-2xl border border-[#E7DDCF] bg-white p-4">
              <QRCodeSVG value={websiteUrl} size={180} />
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <LinkRow label="Customer website" href={websiteUrl} external />
            <LinkRow label="Kitchen display (KDS)" href={kitchenUrl} />
            <LinkRow label="Dashboard" href={dashboardUrl} />
          </div>

          <Link
            href="/dashboard/launch/test-order"
            className="mt-6 flex min-h-14 w-full items-center justify-center rounded-2xl bg-[#171512] px-5 text-base font-bold text-white shadow-lg shadow-black/10 transition active:scale-[0.99]"
          >
            Test order flow
          </Link>
          <Link
            href="/dashboard"
            className="mt-3 flex min-h-14 w-full items-center justify-center rounded-2xl border border-[#E7DDCF] bg-white px-5 text-base font-bold text-[#171512] transition active:scale-[0.99]"
          >
            Go to dashboard
          </Link>
        </section>
    </PageShell>
  );
}
