"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * The wizard's DONE state — hands off to the Launch Center, which shows
 * the owner their live ordering link, QR code, and next steps.
 */
export function FinishStep() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard/launch");
  }, [router]);

  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">ALL SET</p>
      <h1 className="text-2xl font-display font-semibold tracking-tight">Your business is ready!</h1>
      <p className="text-sm text-ink-secondary">Taking you to your dashboard…</p>
    </div>
  );
}
