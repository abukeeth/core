"use client";

import Link from "next/link";
import { useState } from "react";
import { clearAuthRequestKey, getOrCreateAuthRequestKey } from "@/lib/auth-idempotency";
import { forgotPassword, hasApiErrorCode } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    "Password reset request accepted. If an account exists, you will receive an email shortly.",
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const identity = email.trim().toLowerCase();
    const requestKey = getOrCreateAuthRequestKey("forgot-password", identity);
    try {
      const response = await forgotPassword(email, { idempotencyKey: requestKey });
      clearAuthRequestKey("forgot-password", identity);
      setStatusMessage(response.message);
      setSent(true);
    } catch (err) {
      if (hasApiErrorCode(err, "REQUEST_TIMEOUT") || hasApiErrorCode(err, "AUTH_REQUEST_IN_PROGRESS")) {
        setError("Password reset request is still processing. Retry in a moment to confirm the result.");
        return;
      }
      clearAuthRequestKey("forgot-password", identity);
      setError(err instanceof Error ? err.message : "Something went wrong");
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
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">PASSWORD RECOVERY</p>
          <h1 className="mt-2 text-3xl font-display font-semibold tracking-tight">Reset your password.</h1>

          {sent ? (
            <>
              <p className="mt-3 text-sm leading-6 text-ink-secondary">
                {statusMessage}
              </p>
              <Link
                href="/login"
                className="mt-7 flex min-h-14 w-full items-center justify-center rounded-2xl bg-brand px-5 text-base font-bold text-white shadow-lg shadow-black/10"
              >
                Back to login
              </Link>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {error && <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</p>}

              <label className="block text-sm font-semibold text-ink">
                Email
                <input
                  type="email"
                  required
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-2 min-h-14 w-full rounded-2xl border border-line bg-surface px-4 text-base outline-none transition focus:border-brand"
                />
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-brand px-5 text-base font-bold text-white shadow-lg shadow-black/10 transition active:scale-[0.99] disabled:opacity-50"
              >
                {submitting ? "Sending…" : "Send reset link"}
              </button>

              <p className="text-center text-sm text-ink-secondary">
                <Link href="/login" className="font-bold text-brand">Back to login</Link>
              </p>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
