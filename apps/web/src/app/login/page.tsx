"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { login } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password, rememberMe);
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  function showComingSoon(provider: "Google" | "Apple") {
    setError(`${provider} sign in is being prepared. Use email and password for now.`);
  }

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-[#F7F0E5] px-4 py-8 text-[#171512] sm:px-6">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-10 flex items-center justify-between">
          <div className="text-xl font-bold tracking-tight text-[#B97824]">OrderVora</div>
          <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#756B5D] shadow-sm">Business OS</span>
        </div>

        <section className="rounded-[28px] border border-[#E7DDCF] bg-white p-5 shadow-[0_18px_50px_rgba(48,39,27,0.07)] sm:p-7">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">WELCOME BACK</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Run your business from one calm place.</h1>
          <p className="mt-3 text-sm leading-6 text-[#756B5D]">Sign in to manage orders, menu, website, AI tools, customers, and operations.</p>

          <div className="mt-7 grid gap-3">
            <button type="button" onClick={() => showComingSoon("Apple")} className="flex min-h-13 w-full items-center justify-center gap-3 rounded-2xl border border-[#E7DDCF] bg-[#171512] px-4 text-sm font-bold text-white shadow-sm">
              <span className="text-lg" aria-hidden="true"></span>
              Continue with Apple
            </button>
            <button type="button" onClick={() => showComingSoon("Google")} className="flex min-h-13 w-full items-center justify-center gap-3 rounded-2xl border border-[#E7DDCF] bg-[#FFFDF9] px-4 text-sm font-bold text-[#171512] shadow-sm">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm font-black text-[#B97824] shadow-sm" aria-hidden="true">G</span>
              Continue with Google
            </button>
          </div>

          <div className="my-6 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.16em] text-[#A3988A]">
            <span className="h-px flex-1 bg-[#E7DDCF]" />
            OR
            <span className="h-px flex-1 bg-[#E7DDCF]" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
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

            <label className="block text-sm font-semibold text-[#2A251F]">
              Password
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2 min-h-14 w-full rounded-2xl border border-[#E7DDCF] bg-[#FFFDF9] px-4 text-base outline-none transition focus:border-[#B97824] focus:ring-4 focus:ring-[#B97824]/10"
              />
            </label>

            <div className="flex items-center justify-between gap-3 text-sm">
              <label className="flex items-center gap-2 font-semibold text-[#756B5D]">
                <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="h-4 w-4 accent-[#B97824]" />
                Keep me signed in
              </label>
              <Link href="/forgot-password" className="font-bold text-[#A9681F]">Forgot?</Link>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 flex min-h-14 w-full items-center justify-center rounded-2xl bg-[#171512] px-5 text-base font-bold text-white shadow-lg shadow-black/10 transition active:scale-[0.99] disabled:opacity-50"
            >
              {submitting ? "Logging in…" : "Log in"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-[#756B5D]">
            No account? <Link href="/register" className="font-bold text-[#A9681F]">Create your business account</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
