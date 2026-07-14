"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Shown when a dashboard/setup gating request fails for a *transient*
 * reason (5xx, timeout, or network error) rather than a definitive one.
 * Priority 1 fix: such failures must never be misread as "this owner has
 * no business yet" and bounce an existing owner back to the start of the
 * setup wizard — we surface a retry instead of guessing. router.refresh()
 * re-runs the server component that rendered this, so a recovered backend
 * resolves the page normally without a full reload.
 */
export function DashboardLoadError({
  title = "We couldn't load your dashboard",
  description = "This is usually temporary. Check your connection and try again.",
}: {
  title?: string;
  description?: string;
}) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);

  function handleRetry() {
    setRetrying(true);
    router.refresh();
    // router.refresh() doesn't resolve when the re-render visibly completes,
    // so drop the disabled state shortly after to allow another attempt.
    setTimeout(() => setRetrying(false), 1500);
  }

  return (
    <main className="flex min-h-screen w-full items-center justify-center overflow-x-hidden bg-[#F7F0E5] px-4 py-8 text-[#171512]">
      <div className="w-full max-w-md rounded-[28px] border border-[#E7DDCF] bg-white p-6 text-center shadow-[0_18px_50px_rgba(48,39,27,0.07)] sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">SOMETHING WENT WRONG</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-[#756B5D]">{description}</p>
        <button
          type="button"
          onClick={handleRetry}
          disabled={retrying}
          className="mt-6 flex min-h-14 w-full items-center justify-center rounded-2xl bg-[#171512] px-5 text-base font-bold text-white shadow-lg shadow-black/10 transition active:scale-[0.99] disabled:opacity-50"
        >
          {retrying ? "Retrying…" : "Try again"}
        </button>
      </div>
    </main>
  );
}
