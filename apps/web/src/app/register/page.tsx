"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearAuthRequestKey, getOrCreateAuthRequestKey } from "@/lib/auth-idempotency";
import { hasApiErrorCode, register } from "@/lib/api";
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

  // Priority 4: a brand-new owner has no business yet, so send them straight
  // into the setup wizard instead of hopping through /dashboard and relying
  // on its redirect. A *recovered* (already-existing) account may already be
  // fully onboarded, so it still goes to /dashboard, whose gate self-routes
  // to /setup only if that owner's setup is genuinely incomplete.
  function destinationAfterSignup(result: Awaited<ReturnType<typeof register>>): string {
    return result.signupState === "ACCOUNT_RECOVERED" ? "/dashboard" : "/setup";
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return; // Prevent a second submit while the first is still in flight or being verified.
    setError(null);
    setSubmitting(true);
    const identity = email.trim().toLowerCase();
    const requestKey = getOrCreateAuthRequestKey("signup", identity);
    try {
      const result = await register(email, password, name, { idempotencyKey: requestKey });
      clearAuthRequestKey("signup", identity);
      router.push(destinationAfterSignup(result));
      router.refresh();
      // Keep submitting=true — the component is about to unmount on navigation.
      return;
    } catch (err) {
      if (hasApiErrorCode(err, "REQUEST_TIMEOUT") || hasApiErrorCode(err, "AUTH_REQUEST_IN_PROGRESS")) {
        try {
          const result = await register(email, password, name, { idempotencyKey: requestKey });
          clearAuthRequestKey("signup", identity);
          router.push(destinationAfterSignup(result));
          router.refresh();
          return;
        } catch (recoveryErr) {
          setError(
            recoveryErr instanceof Error
              ? recoveryErr.message
              : "Signup is still being confirmed. Please tap Create business account again in a moment.",
          );
          setSubmitting(false);
          return;
        }
      }
      clearAuthRequestKey("signup", identity);
      setError(err instanceof Error ? err.message : "Registration failed");
    }
    setSubmitting(false);
  }

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-canvas px-4 py-8 text-ink sm:px-6">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-brand font-display text-base font-semibold text-white">O</span>
            <span className="font-display text-xl font-semibold tracking-[-0.2px] text-ink">OrderVora</span>
          </div>
          <span className="rounded-full bg-surface px-3 py-1.5 text-xs font-semibold text-ink-secondary shadow-sm">Business OS</span>
        </div>

        <section className="rounded-[24px] border border-line bg-surface p-5 shadow-[var(--ov-elevation)] sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">CREATE ACCOUNT</p>
          <h1 className="mt-2 font-display text-[28px] font-semibold leading-[34px] tracking-[-0.3px]">Start building your business.</h1>
          <p className="mt-3 text-sm leading-6 text-ink-secondary">Create your owner account, then import your menu and launch your website.</p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            {error && <p className="rounded-[14px] border border-danger/25 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</p>}

            <label className="block text-sm font-semibold text-ink">
              Owner name
              <input type="text" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="mt-2 min-h-14 w-full rounded-[14px] border border-line bg-surface px-4 text-base text-ink outline-none transition focus:border-brand" />
            </label>

            <label className="block text-sm font-semibold text-ink">
              Email
              <input type="email" required inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 min-h-14 w-full rounded-[14px] border border-line bg-surface px-4 text-base text-ink outline-none transition focus:border-brand" />
            </label>

            <label className="block text-sm font-semibold text-ink">
              Password
              <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 min-h-14 w-full rounded-[14px] border border-line bg-surface px-4 text-base text-ink outline-none transition focus:border-brand" />
            </label>

            <button type="submit" disabled={submitting} className="mt-2 flex min-h-14 w-full items-center justify-center rounded-[16px] bg-brand px-5 text-base font-semibold text-white transition active:scale-[0.99] disabled:opacity-50">
              {submitting ? "Creating account…" : "Create business account"}
            </button>
            <p className="text-center text-xs leading-5 text-ink-secondary">
              By creating an account you agree to our{" "}
              <Link href="/terms" className="font-semibold text-brand">Terms of Service</Link> and{" "}
              <Link href="/privacy" className="font-semibold text-brand">Privacy Policy</Link>.
            </p>
          </form>

          <p className="mt-6 text-center text-sm text-ink-secondary">
            Already have an account? <Link href="/login" className="font-semibold text-brand">Log in</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
