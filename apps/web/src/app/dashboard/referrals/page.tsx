"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/ui";
import { getRestaurant, listReferrals, type ReferredRestaurant, type Restaurant } from "@/lib/api";

export default function ReferralsPage() {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [referrals, setReferrals] = useState<ReferredRestaurant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getRestaurant(), listReferrals()])
      .then(([{ restaurant: loaded }, { referrals: loadedReferrals }]) => {
        if (cancelled) return;
        setRestaurant(loaded);
        setReferrals(loadedReferrals);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load referral data");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const referralLink = restaurant?.referralCode
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/register?ref=${restaurant.referralCode}`
    : null;

  async function handleCopy() {
    if (!referralLink) return;
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <PageShell maxWidth="2xl">
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Refer other restaurants</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Share your link with other restaurant owners. This tracks who signed up through you — rewards for
          referrals aren&apos;t live yet since OrderVora&apos;s own billing system hasn&apos;t launched, but every
          signup is already recorded and ready once it does.
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {referralLink && (
          <div className="flex flex-col gap-2 rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-950">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Your referral link</span>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={referralLink}
                className="flex-1 rounded border border-black/[.08] px-3 py-2 text-sm dark:border-white/[.145] dark:bg-black"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="rounded-full bg-foreground px-4 py-2 text-sm text-background"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col divide-y divide-black/[.08] rounded-lg border border-black/[.08] bg-white dark:divide-white/[.145] dark:border-white/[.145] dark:bg-zinc-950">
          <div className="p-4">
            <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Referred restaurants — {referrals.length}
            </h2>
          </div>
          {referrals.length === 0 && (
            <p className="p-4 text-sm text-zinc-500 dark:text-zinc-400">No referrals yet.</p>
          )}
          {referrals.map((referred) => (
            <div key={referred.id} className="flex items-center justify-between gap-4 p-4">
              <span className="text-sm font-medium text-black dark:text-zinc-50">{referred.name}</span>
              <span className="text-xs text-zinc-500">
                {referred.isPublished ? "Published" : "Set up in progress"} ·{" "}
                {new Date(referred.createdAt).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
    </PageShell>
  );
}
