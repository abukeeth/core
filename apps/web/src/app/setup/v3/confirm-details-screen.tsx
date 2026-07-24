"use client";

import { useEffect, useState } from "react";
import { getRestaurant, updateRestaurant, type Restaurant } from "@/lib/api";
import { inputClass, primaryButtonClass } from "../wizard-shell";

// The placeholder createRestaurant assigns when the owner only picked a type —
// treated as "not yet named" so the field starts empty for the owner to fill.
const PLACEHOLDER_NAME = "My Business";

/**
 * Onboarding V3 — Confirm details. The one step that guarantees a store leaves
 * onboarding with a real NAME and a chance to set its ADDRESS, on BOTH paths:
 * after an AI import (`approveJob` may have filled these from the extracted
 * business profile) and after Manual/Skip (where they're still the placeholder /
 * empty). It always re-fetches the latest server state so AI-filled values are
 * pre-populated, then saves the owner's confirmed/edited values before build.
 *
 * Deliberately NOT a payment or delivery-config step — name + address only.
 */
export function ConfirmDetailsScreen({ onConfirmed }: { onConfirmed: () => void }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill from the freshest server state — the container's snapshot can be
  // stale (an AI import updates name/address server-side *after* it was taken).
  useEffect(() => {
    let cancelled = false;
    getRestaurant()
      .then(({ restaurant }: { restaurant: Restaurant }) => {
        if (cancelled) return;
        setName(restaurant.name && restaurant.name !== PLACEHOLDER_NAME ? restaurant.name : "");
        setAddress(restaurant.address ?? "");
      })
      .catch(() => {
        // A transient read failure shouldn't trap the owner — they can still
        // type their details and continue (the save below is the real write).
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleConfirm() {
    if (!name.trim()) {
      setError("Please enter your business name.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await updateRestaurant({ name: name.trim(), address: address.trim() || undefined });
      onConfirmed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your details. Please try again.");
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-ink-secondary">Loading your details…</p>;
  }

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">CONFIRM YOUR DETAILS</p>
      <h1 className="mt-2 text-3xl font-display font-semibold tracking-tight">Last thing — your name &amp; address</h1>
      <p className="mt-3 text-sm leading-6 text-ink-secondary">
        This is what customers see on your storefront and receipts. You can change it anytime in Settings.
      </p>

      {error && <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</p>}

      <div className="mt-6 space-y-5">
        <label className="block">
          <span className="text-sm font-bold text-ink">Business name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitting}
            placeholder="e.g. Marlowe &amp; Sons"
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="text-sm font-bold text-ink">
            Address <span className="font-normal text-ink-secondary">(optional)</span>
          </span>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            disabled={submitting}
            placeholder="Street, city, state"
            className={inputClass}
          />
          <span className="mt-1.5 block text-xs text-ink-secondary">Used for pickup and your storefront. You can add or refine it later.</span>
        </label>
      </div>

      <div className="mt-8">
        <button type="button" onClick={handleConfirm} disabled={submitting || name.trim() === ""} className={primaryButtonClass}>
          {submitting ? "Saving…" : "Confirm & build my storefront"}
        </button>
      </div>
    </div>
  );
}
