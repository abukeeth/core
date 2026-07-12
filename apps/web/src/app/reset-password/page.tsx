"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { resetPassword } from "@/lib/api";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Plain window.location (not useSearchParams) to keep this page
  // statically prerenderable — mirrors the register page's ?ref= pattern.
  // window is unavailable at SSR time, so reading it into render-affecting
  // state necessarily happens in an effect, not a lazy useState initializer.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(new URLSearchParams(window.location.search).get("token"));
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    setError(null);
    setSubmitting(true);
    try {
      await resetPassword(token, newPassword);
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
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
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">PASSWORD RESET</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Set a new password.</h1>

          {done ? (
            <p className="mt-3 text-sm leading-6 text-[#756B5D]">Password updated. Redirecting to log in…</p>
          ) : token === null ? null : !token ? (
            <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">This reset link is missing a token.</p>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {error && <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</p>}

              <label className="block text-sm font-semibold text-[#2A251F]">
                New password
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="mt-2 min-h-14 w-full rounded-2xl border border-[#E7DDCF] bg-[#FFFDF9] px-4 text-base outline-none transition focus:border-[#B97824] focus:ring-4 focus:ring-[#B97824]/10"
                />
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-[#171512] px-5 text-base font-bold text-white shadow-lg shadow-black/10 transition active:scale-[0.99] disabled:opacity-50"
              >
                {submitting ? "Saving…" : "Save new password"}
              </button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-[#756B5D]">
            <Link href="/login" className="font-bold text-[#A9681F]">Back to login</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
