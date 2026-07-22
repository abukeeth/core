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
    <main className="min-h-screen w-full overflow-x-hidden bg-canvas px-4 py-8 text-ink sm:px-6">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-10 flex items-center justify-between">
          <div className="text-xl font-bold tracking-tight text-brand">OrderVora</div>
          <span className="rounded-full bg-surface px-3 py-1.5 text-xs font-semibold text-ink-secondary shadow-sm">Business OS</span>
        </div>

        <section className="rounded-[24px] border border-line bg-surface p-5 shadow-[var(--ov-elevation)] sm:p-7">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">PASSWORD RESET</p>
          <h1 className="mt-2 text-3xl font-display font-semibold tracking-tight">Set a new password.</h1>

          {done ? (
            <p className="mt-3 text-sm leading-6 text-ink-secondary">Password updated. Redirecting to log in…</p>
          ) : token === null ? null : !token ? (
            <p className="mt-3 rounded-2xl border border-danger/25 bg-danger/5 px-4 py-3 text-sm text-danger">This reset link is missing a token.</p>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {error && <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</p>}

              <label className="block text-sm font-semibold text-ink">
                New password
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="mt-2 min-h-14 w-full rounded-2xl border border-line bg-surface px-4 text-base outline-none transition focus:border-brand"
                />
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-brand px-5 text-base font-bold text-white shadow-lg shadow-black/10 transition active:scale-[0.99] disabled:opacity-50"
              >
                {submitting ? "Saving…" : "Save new password"}
              </button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-ink-secondary">
            <Link href="/login" className="font-bold text-brand">Back to login</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
