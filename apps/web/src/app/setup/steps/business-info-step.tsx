"use client";

import { useState } from "react";
import { setSetupStep, updateRestaurant, type Restaurant } from "@/lib/api";
import { inputClass, primaryButtonClass } from "../wizard-shell";

export function BusinessInfoStep({
  restaurant,
  onDone,
}: {
  restaurant: Restaurant;
  onDone: (restaurant: Restaurant) => void;
}) {
  const [name, setName] = useState(restaurant.name === "My Business" ? "" : restaurant.name);
  const [phone, setPhone] = useState(restaurant.phone ?? "");
  const [description, setDescription] = useState(restaurant.description ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await updateRestaurant({ name, phone: phone || undefined, description: description || undefined });
      const { restaurant: updated } = await setSetupStep("LOCATION");
      onDone(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">TELL US ABOUT IT</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Business info</h1>
      <p className="mt-3 text-sm leading-6 text-[#756B5D]">This is what customers will see on your website and receipts.</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {error && <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</p>}

        <label className="block text-sm font-semibold text-[#2A251F]">
          Business name
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="e.g. Maple Street Coffee"
          />
        </label>

        <label className="block text-sm font-semibold text-[#2A251F]">
          Phone
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
            placeholder="Optional"
          />
        </label>

        <label className="block text-sm font-semibold text-[#2A251F]">
          Short description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="mt-2 w-full rounded-2xl border border-[#E7DDCF] bg-[#FFFDF9] px-4 py-3 text-base outline-none transition focus:border-[#B97824] focus:ring-4 focus:ring-[#B97824]/10"
            placeholder="Optional — a sentence about your business"
          />
        </label>

        <button type="submit" disabled={submitting} className={primaryButtonClass}>
          {submitting ? "Saving…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
