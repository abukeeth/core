"use client";

import { useState } from "react";
import { setSetupStep, updateRestaurant, type Restaurant } from "@/lib/api";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "../wizard-shell";

export function LocationStep({
  restaurant,
  onDone,
}: {
  restaurant: Restaurant;
  onDone: (restaurant: Restaurant) => void;
}) {
  const [address, setAddress] = useState(restaurant.address ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function advance() {
    const { restaurant: updated } = await setSetupStep("PAYMENT_PROVIDER");
    onDone(updated);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (address.trim()) {
        await updateRestaurant({ address });
      }
      await advance();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
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
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">WHERE ARE YOU</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Location</h1>
      <p className="mt-3 text-sm leading-6 text-[#756B5D]">
        Used for pickup, delivery, and your website. You can refine this later.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {error && <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</p>}

        <label className="block text-sm font-semibold text-[#2A251F]">
          Address
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className={inputClass}
            placeholder="Street, city, state"
          />
        </label>

        <button type="submit" disabled={submitting} className={primaryButtonClass}>
          {submitting ? "Saving…" : "Continue"}
        </button>
        <button type="button" onClick={handleSkip} disabled={submitting} className={secondaryButtonClass}>
          Skip for now
        </button>
      </form>
    </div>
  );
}
