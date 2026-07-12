"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/ui";
import type { Restaurant } from "@/lib/api";

const STEPS = [
  "Opens your live ordering page in a new tab — the same page your customers will see.",
  "Add an item to the cart and go through checkout, just like a real customer would.",
  "Come back to this tab and confirm the order arrived on your Orders/Kitchen screens.",
];

export function TestOrderFlow({ restaurant }: { restaurant: Restaurant }) {
  const [origin, setOrigin] = useState("");
  const [opened, setOpened] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    // window is unavailable at SSR time, so reading it into render-affecting
    // state necessarily happens in an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
  }, []);

  const websiteUrl = `${origin}/order/${restaurant.id}`;

  return (
    <PageShell maxWidth="lg">
        <section className="rounded-[28px] border border-[#E7DDCF] bg-white p-5 shadow-[0_18px_50px_rgba(48,39,27,0.07)] sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">TEST ORDER</p>
            <Link href="/dashboard/launch" className="shrink-0 text-sm font-bold text-[#756B5D]">
              Back
            </Link>
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            Run a test order before you go live.
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#756B5D]">
            Placing one order yourself is the fastest way to catch anything worth fixing before a
            real customer does.
          </p>

          <ol className="mt-6 space-y-3">
            {STEPS.map((step, index) => (
              <li key={step} className="flex gap-3 rounded-2xl border border-[#E7DDCF] bg-[#FBF7F1] px-4 py-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#171512] text-xs font-bold text-white">
                  {index + 1}
                </span>
                <p className="text-sm leading-6 text-[#171512]">{step}</p>
              </li>
            ))}
          </ol>

          <a
            href={websiteUrl}
            target="_blank"
            rel="noreferrer"
            onClick={() => setOpened(true)}
            className="mt-6 flex min-h-14 w-full items-center justify-center rounded-2xl bg-[#171512] px-5 text-base font-bold text-white shadow-lg shadow-black/10 transition active:scale-[0.99]"
          >
            Open my ordering page
          </a>

          {opened && !confirmed && (
            <div className="mt-4 rounded-2xl border border-[#E7DDCF] bg-[#FBF7F1] px-4 py-4">
              <p className="text-sm font-bold text-[#171512]">Did your test order go through?</p>
              <p className="mt-1 text-xs text-[#8A7D6C]">
                Check Dashboard → Orders or the Kitchen display to confirm it arrived.
              </p>
              <button
                type="button"
                onClick={() => setConfirmed(true)}
                className="mt-3 flex min-h-11 w-full items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white transition active:scale-[0.99]"
              >
                Yes, it worked
              </button>
            </div>
          )}

          {confirmed && (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-bold text-emerald-800">
              Great — you&apos;re ready to share your ordering link with real customers.
            </div>
          )}

          <Link
            href="/dashboard/launch"
            className="mt-3 flex min-h-14 w-full items-center justify-center rounded-2xl border border-[#E7DDCF] bg-white px-5 text-base font-bold text-[#171512] transition active:scale-[0.99]"
          >
            Back to Launch Center
          </Link>
        </section>
    </PageShell>
  );
}
