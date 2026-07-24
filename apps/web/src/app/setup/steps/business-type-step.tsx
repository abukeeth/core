"use client";

import { useState } from "react";
import { createRestaurant, type BusinessType, type Restaurant } from "@/lib/api";
import { BUSINESS_TYPES } from "../business-types";

export function BusinessTypeStep({ onDone }: { onDone: (restaurant: Restaurant) => void }) {
  const [submitting, setSubmitting] = useState<BusinessType | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePick(businessType: BusinessType) {
    setSubmitting(businessType);
    setError(null);
    try {
      const { restaurant } = await createRestaurant({ businessType });
      onDone(restaurant);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(null);
    }
  }

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">LET&apos;S SET UP YOUR BUSINESS</p>
      <h1 className="mt-2 text-3xl font-display font-semibold tracking-tight">What kind of business is this?</h1>
      <p className="mt-3 text-sm leading-6 text-ink-secondary">This helps us tailor your menu, website, and ordering flow.</p>

      {error && <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</p>}

      <div className="mt-6 grid grid-cols-2 gap-3">
        {BUSINESS_TYPES.map((type) => (
          <button
            key={type.value}
            type="button"
            onClick={() => handlePick(type.value)}
            disabled={submitting !== null}
            className={`flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border px-3 py-4 text-center text-sm font-bold transition active:scale-[0.98] disabled:opacity-50 ${
              submitting === type.value
                ? "border-brand bg-brand text-white"
                : "border-line bg-subtle text-ink hover:bg-surface"
            }`}
          >
            <span className="text-2xl" aria-hidden="true">
              {type.icon}
            </span>
            {type.label}
          </button>
        ))}
      </div>

      <p className="mt-6 text-center text-xs text-[#9A8B77]">You can change this later from Business settings.</p>
    </div>
  );
}
