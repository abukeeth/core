"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { verifyEmail } from "@/lib/api";

export default function VerifyEmailPage() {
  const [status, setStatus] = useState<"pending" | "success" | "error">("pending");
  const [error, setError] = useState<string | null>(null);

  // window is unavailable at SSR time, so reading the token into
  // render-affecting state necessarily happens in an effect.
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus("error");
      setError("This verification link is missing a token.");
      return;
    }
    verifyEmail(token)
      .then(() => setStatus("success"))
      .catch((err) => {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Verification failed");
      });
  }, []);

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-canvas px-4 py-8 text-ink sm:px-6">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-10 flex items-center justify-between">
          <div className="text-xl font-bold tracking-tight text-brand">OrderVora</div>
          <span className="rounded-full bg-surface px-3 py-1.5 text-xs font-semibold text-ink-secondary shadow-sm">Business OS</span>
        </div>

        <section className="rounded-[24px] border border-line bg-surface p-5 shadow-[var(--ov-elevation)] sm:p-7">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">ACCOUNT</p>
          <h1 className="mt-2 text-3xl font-display font-semibold tracking-tight">Email verification</h1>

          {status === "pending" && <p className="mt-3 text-sm leading-6 text-ink-secondary">Verifying…</p>}
          {status === "success" && <p className="mt-3 text-sm leading-6 text-ink-secondary">Your email has been verified.</p>}
          {status === "error" && <p className="mt-3 rounded-2xl border border-danger/25 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</p>}

          <p className="mt-6 text-center text-sm text-ink-secondary">
            <Link href="/dashboard" className="font-bold text-brand">Go to dashboard</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
