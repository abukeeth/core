"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/ui";
import { getBillingSummary, openBillingPortal, startBillingCheckout, type BillingSummary } from "@/lib/api";

const PLAN_PRICE_HINT = "OrderVora Starter — one plan, everything included.";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function StatusPill({ state }: { state: BillingSummary["state"] }) {
  const styles: Record<BillingSummary["state"], { label: string; className: string }> = {
    TRIALING: { label: "Free trial", className: "bg-amber-100 text-amber-800 border-amber-200" },
    TRIAL_EXPIRED: { label: "Trial ended", className: "bg-red-100 text-red-700 border-red-200" },
    ACTIVE: { label: "Active", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    PAST_DUE: { label: "Payment issue", className: "bg-red-100 text-red-700 border-red-200" },
    CANCELED: { label: "Canceled", className: "bg-[#EEE7DA] text-[#756B5D] border-[#E7DDCF]" },
  };
  const s = styles[state];
  return <span className={`rounded-full border px-3 py-1 text-xs font-bold ${s.className}`}>{s.label}</span>;
}

export default function BillingPage() {
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState<"checkout" | "portal" | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBillingSummary()
      .then(({ billing: loaded }) => {
        if (!cancelled) setBilling(loaded);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load billing");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubscribe() {
    setRedirecting("checkout");
    setError(null);
    try {
      const { url } = await startBillingCheckout();
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start checkout");
      setRedirecting(null);
    }
  }

  async function handlePortal() {
    setRedirecting("portal");
    setError(null);
    try {
      const { url } = await openBillingPortal();
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't open the billing portal");
      setRedirecting(null);
    }
  }

  const trialCopy =
    billing?.state === "TRIALING"
      ? billing.trialDaysLeft === 1
        ? "Your free trial ends tomorrow."
        : `Your free trial ends in ${billing.trialDaysLeft} days (${formatDate(billing.trialEndsAt)}).`
      : billing?.state === "TRIAL_EXPIRED"
        ? "Your free trial has ended. Subscribe to keep your storefront taking orders."
        : null;

  return (
    <PageShell maxWidth="3xl">
      <header className="pt-2 lg:pt-0">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">YOUR PLAN</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Billing</h1>
      </header>

      {error && <p className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {!billing && !error && <p className="mt-6 text-sm text-[#756B5D]">Loading your plan…</p>}

      {billing && (
        <div className="mt-6 space-y-5">
          <section className="rounded-3xl border border-[#E7DDCF] bg-white p-5 shadow-[0_12px_36px_rgba(48,39,27,0.04)] sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">Starter plan</h2>
                <p className="mt-1 text-sm text-[#756B5D]">{PLAN_PRICE_HINT}</p>
              </div>
              <StatusPill state={billing.state} />
            </div>

            {trialCopy && <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{trialCopy}</p>}
            {billing.state === "PAST_DUE" && (
              <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                Your last payment didn&apos;t go through. Update your card to keep your subscription active.
              </p>
            )}
            {billing.state === "ACTIVE" && (
              <p className="mt-4 text-sm text-[#756B5D]">
                {billing.cancelAtPeriodEnd
                  ? `Your subscription ends on ${formatDate(billing.currentPeriodEnd)}.`
                  : billing.currentPeriodEnd
                    ? `Next renewal: ${formatDate(billing.currentPeriodEnd)}.`
                    : "Your subscription is active."}
              </p>
            )}

            {!billing.configured && (
              <p className="mt-4 rounded-2xl border border-[#E7DDCF] bg-[#FBF7F1] px-4 py-3 text-sm text-[#756B5D]">
                Online subscription checkout isn&apos;t available yet — you&apos;re on the free trial meanwhile.
              </p>
            )}

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              {billing.state !== "ACTIVE" && billing.configured && (
                <button
                  type="button"
                  onClick={handleSubscribe}
                  disabled={redirecting !== null}
                  className="flex min-h-12 items-center justify-center rounded-2xl bg-[#171512] px-6 text-sm font-bold text-white shadow-lg shadow-black/10 transition active:scale-[0.99] disabled:opacity-50"
                >
                  {redirecting === "checkout" ? "Opening checkout…" : "Subscribe now"}
                </button>
              )}
              {billing.hasStripeSubscription && (
                <button
                  type="button"
                  onClick={handlePortal}
                  disabled={redirecting !== null}
                  className="flex min-h-12 items-center justify-center rounded-2xl border border-[#E7DDCF] bg-white px-6 text-sm font-bold text-[#171512] transition active:scale-[0.99] disabled:opacity-50"
                >
                  {redirecting === "portal" ? "Opening…" : "Manage billing"}
                </button>
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-[#E7DDCF] bg-white p-5 shadow-[0_12px_36px_rgba(48,39,27,0.04)] sm:p-6">
            <h2 className="text-sm font-bold">What happens when a trial ends?</h2>
            <p className="mt-2 text-sm leading-6 text-[#756B5D]">
              Your dashboard, menu, and data are never locked. Without an active plan, your storefront pauses taking new
              orders and publishing changes until you subscribe — everything resumes instantly after checkout.
            </p>
          </section>
        </div>
      )}
    </PageShell>
  );
}
