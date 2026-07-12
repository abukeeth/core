"use client";

import { useState } from "react";
import { setSetupStep, type Restaurant } from "@/lib/api";
import { connectPaymentProvider } from "@/lib/owner-commerce-api";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "../wizard-shell";

export function PaymentProviderStep({ onDone }: { onDone: (restaurant: Restaurant) => void }) {
  const [secretKey, setSecretKey] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function advance() {
    const { restaurant } = await setSetupStep("MENU_IMPORT");
    onDone(restaurant);
  }

  async function handleConnect(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await connectPaymentProvider("STRIPE", secretKey, undefined, undefined, publicKey || undefined);
      await advance();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect Stripe");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSkip() {
    setSubmitting(true);
    setError(null);
    try {
      await advance();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">GET PAID</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Connect a payment provider</h1>
      <p className="mt-3 text-sm leading-6 text-[#756B5D]">
        Connect Stripe to accept card payments online, or skip and set this up later from Dashboard → Payments.
      </p>

      <form onSubmit={handleConnect} className="mt-6 space-y-4">
        {error && <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</p>}

        <label className="block text-sm font-semibold text-[#2A251F]">
          Stripe secret key
          <input
            type="password"
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            className={inputClass}
            placeholder="sk_live_…"
          />
        </label>

        <label className="block text-sm font-semibold text-[#2A251F]">
          Stripe publishable key
          <input
            type="text"
            value={publicKey}
            onChange={(e) => setPublicKey(e.target.value)}
            className={inputClass}
            placeholder="pk_live_… (optional here, required before launch)"
          />
        </label>

        <button type="submit" disabled={submitting || !secretKey} className={primaryButtonClass}>
          {submitting ? "Connecting…" : "Connect Stripe"}
        </button>
        <button type="button" onClick={handleSkip} disabled={submitting} className={secondaryButtonClass}>
          Skip for now
        </button>
      </form>
    </div>
  );
}
