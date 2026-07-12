"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createRestaurant, updateRestaurant, type Restaurant } from "@/lib/api";
import { clearStoredReferralCode, getStoredReferralCode } from "@/lib/referral-storage";

export function RestaurantForm({ restaurant }: { restaurant: Restaurant | null }) {
  const router = useRouter();
  const [name, setName] = useState(restaurant?.name ?? "");
  const [description, setDescription] = useState(restaurant?.description ?? "");
  const [address, setAddress] = useState(restaurant?.address ?? "");
  const [phone, setPhone] = useState(restaurant?.phone ?? "");
  const [isPublished, setIsPublished] = useState(restaurant?.isPublished ?? false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const input = {
        name,
        description: description || undefined,
        address: address || undefined,
        phone: phone || undefined,
        isPublished,
      };
      if (restaurant) {
        await updateRestaurant(input);
      } else {
        const referralCode = getStoredReferralCode();
        await createRestaurant({ ...input, referralCode: referralCode ?? undefined });
        clearStoredReferralCode();
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save restaurant");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-lg border border-black/[.08] bg-white p-8 dark:border-white/[.145] dark:bg-zinc-950"
    >
      <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
        {restaurant ? "Edit restaurant" : "Set up your restaurant"}
      </h1>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
        Name
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded border border-black/[.08] px-3 py-2 dark:border-white/[.145] dark:bg-black"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
        Description
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="rounded border border-black/[.08] px-3 py-2 dark:border-white/[.145] dark:bg-black"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
        Address
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="rounded border border-black/[.08] px-3 py-2 dark:border-white/[.145] dark:bg-black"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
        Phone
        <input
          type="text"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="rounded border border-black/[.08] px-3 py-2 dark:border-white/[.145] dark:bg-black"
        />
      </label>

      {restaurant && (
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
          Published
        </label>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-2 rounded-full bg-foreground px-5 py-2 text-background disabled:opacity-50"
      >
        {submitting ? "Saving..." : restaurant ? "Save changes" : "Create restaurant"}
      </button>
    </form>
  );
}
