"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isTimeoutMessage, login, register } from "@/lib/api";
import { setStoredReferralCode } from "@/lib/referral-storage";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) setStoredReferralCode(ref);
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return; // Prevent a second submit while the first is still in flight or being verified.
    setError(null);
    setSubmitting(true);
    try {
      await register(email, password, name);
      router.push("/dashboard");
      router.refresh();
      // Keep submitting=true — the component is about to unmount on navigation.
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Registration failed";
      // §17 — a client-side timeout doesn't mean the account wasn't actually
      // created; the server may have finished the work (including setting
      // the session cookie on a response our aborted fetch never received)
      // regardless. There's no session to just re-check yet in that case,
      // but logging in fresh with the same credentials the owner just typed
      // works whether the account was created a moment ago or not — and if
      // it wasn't, this simply fails like any bad-credentials login would.
      if (isTimeoutMessage(message)) {
        try {
          await login(email, password);
          router.push("/dashboard");
          router.refresh();
          return;
        } catch {
          // Genuinely not created — fall through to the error below.
        }
      }
      setError(message);
    }
    setSubmitting(false);
  }

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-[#F7F0E5] px-4 py-8 text-[#171512] sm:px-6">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-10 flex items-center justify-between">
          <div className="text-xl font-bold tracking-tight text-[#B97824]">OrderVora</div>
          <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#756B5D] shadow-sm">Business OS</span>
        </div>

        <section className="rounded-[28px] border border-[#E7DDCF] bg-white p-5 shadow-[0_18px_50px_rgba(48,39,27,0.07)] sm:p-7">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">CREATE ACCOUNT</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Start building your business.</h1>
          <p className="mt-3 text-sm leading-6 text-[#756B5D]">Create your owner account, then import your menu and launch your website.</p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            {error && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

            <label className="block text-sm font-semibold text-[#2A251F]">
              Owner name
              <input type="text" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="mt-2 min-h-14 w-full rounded-2xl border border-[#E7DDCF] bg-[#FFFDF9] px-4 text-base outline-none transition focus:border-[#B97824] focus:ring-4 focus:ring-[#B97824]/10" />
            </label>

            <label className="block text-sm font-semibold text-[#2A251F]">
              Email
              <input type="email" required inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 min-h-14 w-full rounded-2xl border border-[#E7DDCF] bg-[#FFFDF9] px-4 text-base outline-none transition focus:border-[#B97824] focus:ring-4 focus:ring-[#B97824]/10" />
            </label>

            <label className="block text-sm font-semibold text-[#2A251F]">
              Password
              <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 min-h-14 w-full rounded-2xl border border-[#E7DDCF] bg-[#FFFDF9] px-4 text-base outline-none transition focus:border-[#B97824] focus:ring-4 focus:ring-[#B97824]/10" />
            </label>

            <button type="submit" disabled={submitting} className="mt-2 flex min-h-14 w-full items-center justify-center rounded-2xl bg-[#171512] px-5 text-base font-bold text-white shadow-lg shadow-black/10 transition active:scale-[0.99] disabled:opacity-50">
              {submitting ? "Creating account…" : "Create business account"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-[#756B5D]">
            Already have an account? <Link href="/login" className="font-bold text-[#A9681F]">Log in</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
