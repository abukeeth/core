"use client";

import Link from "next/link";
import { useState } from "react";
import { forgotPassword } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-[#F7F0E5] px-4 py-8 text-[#171512] sm:px-6">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-10 flex items-center justify-between">
          <div className="text-xl font-bold tracking-tight text-[#B97824]">OrderVora</div>
          <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#756B5D] shadow-sm">Business OS</span>
        </div>

        <section className="rounded-[28px] border border-[#E7DDCF] bg-white p-5 shadow-[0_18px_50px_rgba(48,39,27,0.07)] sm:p-7">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">PASSWORD RECOVERY</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Reset your password.</h1>

          {sent ? (
            <>
              <p className="mt-3 text-sm leading-6 text-[#756B5D]">
                If an account exists for that email, a password reset link has been sent. Check your inbox.
              </p>
              <Link
                href="/login"
                className="mt-7 flex min-h-14 w-full items-center justify-center rounded-2xl bg-[#171512] px-5 text-base font-bold text-white shadow-lg shadow-black/10"
              >
                Back to login
              </Link>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {error && <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</p>}

              <label className="block text-sm font-semibold text-[#2A251F]">
                Email
                <input
                  type="email"
                  required
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-2 min-h-14 w-full rounded-2xl border border-[#E7DDCF] bg-[#FFFDF9] px-4 text-base outline-none transition focus:border-[#B97824] focus:ring-4 focus:ring-[#B97824]/10"
                />
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-[#171512] px-5 text-base font-bold text-white shadow-lg shadow-black/10 transition active:scale-[0.99] disabled:opacity-50"
              >
                {submitting ? "Sending…" : "Send reset link"}
              </button>

              <p className="text-center text-sm text-[#756B5D]">
                <Link href="/login" className="font-bold text-[#A9681F]">Back to login</Link>
              </p>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
