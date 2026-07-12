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
    <main className="min-h-screen w-full overflow-x-hidden bg-[#F7F0E5] px-4 py-8 text-[#171512] sm:px-6">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-10 flex items-center justify-between">
          <div className="text-xl font-bold tracking-tight text-[#B97824]">OrderVora</div>
          <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#756B5D] shadow-sm">Business OS</span>
        </div>

        <section className="rounded-[28px] border border-[#E7DDCF] bg-white p-5 shadow-[0_18px_50px_rgba(48,39,27,0.07)] sm:p-7">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">ACCOUNT</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Email verification</h1>

          {status === "pending" && <p className="mt-3 text-sm leading-6 text-[#756B5D]">Verifying…</p>}
          {status === "success" && <p className="mt-3 text-sm leading-6 text-[#756B5D]">Your email has been verified.</p>}
          {status === "error" && <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

          <p className="mt-6 text-center text-sm text-[#756B5D]">
            <Link href="/dashboard" className="font-bold text-[#A9681F]">Go to dashboard</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
