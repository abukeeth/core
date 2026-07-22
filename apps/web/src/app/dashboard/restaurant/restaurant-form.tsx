"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DetailShell } from "@/components/owner-shell";
import { initials } from "@/components/owner-icons";
import { createRestaurant, updateRestaurant, type Restaurant } from "@/lib/api";
import { clearStoredReferralCode, getStoredReferralCode } from "@/lib/referral-storage";

/* Store settings — Figma "Owner Dashboard V3 / Store Settings" (node 43:147).
 * Reuses the existing updateRestaurant/createRestaurant logic. Toggles the API
 * cannot persist (show phone/address publicly) are intentionally omitted rather
 * than faked; "Show store online" maps to the real isPublished flag. */

const FIELD = "mt-1.5 w-full rounded-[14px] border border-line bg-surface px-3.5 py-3 text-sm text-ink outline-none transition focus:border-brand";
const LABEL = "text-sm font-semibold text-ink";

function businessTypeLabel(type: string) {
  return type.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function RestaurantForm({ restaurant, hoursSlot }: { restaurant: Restaurant | null; hoursSlot?: React.ReactNode }) {
  const router = useRouter();
  const [name, setName] = useState(restaurant?.name ?? "");
  const [description, setDescription] = useState(restaurant?.description ?? "");
  const [address, setAddress] = useState(restaurant?.address ?? "");
  const [phone, setPhone] = useState(restaurant?.phone ?? "");
  const [isPublished, setIsPublished] = useState(restaurant?.isPublished ?? false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
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
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save store settings");
    } finally {
      setSubmitting(false);
    }
  }

  const saveButton = (
    <button type="submit" form="store-settings-form" disabled={submitting}
      className="rounded-[12px] px-3 py-1.5 text-sm font-semibold text-brand transition disabled:opacity-50">
      {submitting ? "Saving…" : "Save"}
    </button>
  );

  return (
    <DetailShell title="Store settings" backHref="/dashboard" headerRight={saveButton}>
      <form id="store-settings-form" onSubmit={handleSubmit} className="space-y-4">
        {/* Identity */}
        <div className="flex items-center gap-3.5 rounded-[18px] border border-line bg-surface p-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-[16px] bg-brand-soft font-display text-lg font-semibold text-brand">
            {initials(name || "Store")}
          </span>
          <div className="min-w-0">
            <p className="truncate font-display text-[19px] font-semibold leading-[25px] text-ink">{name || "Your store"}</p>
            <p className="truncate text-xs text-ink-muted">
              {restaurant ? businessTypeLabel(restaurant.businessType) : "New store"}{address ? ` · ${address}` : ""}
            </p>
          </div>
        </div>

        {error && <div className="rounded-[14px] border border-danger/25 bg-danger/5 px-4 py-3 text-sm font-medium text-danger">{error}</div>}
        {saved && !error && <div className="rounded-[14px] border border-success/25 bg-success/5 px-4 py-3 text-sm font-medium text-success">Store settings saved.</div>}

        <label className="block">
          <span className={LABEL}>Business name</span>
          <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className={FIELD} placeholder="Your store name" />
        </label>

        <div className="block">
          <span className={LABEL}>Website</span>
          <div className="mt-1.5 flex items-center justify-between gap-3 rounded-[14px] border border-line bg-subtle px-3.5 py-3">
            <span className="truncate text-sm text-ink-secondary">Managed in Website settings</span>
            <Link href="/dashboard/website" className="shrink-0 text-sm font-semibold text-brand">Open</Link>
          </div>
          <p className="mt-1.5 text-xs text-ink-muted">Connect a custom domain from Website settings.</p>
        </div>

        <label className="block">
          <span className={LABEL}>Phone number</span>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={FIELD} placeholder="(555) 555-0100" />
        </label>

        <label className="block">
          <span className={LABEL}>Business address</span>
          <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className={FIELD} placeholder="Street, city, state ZIP" />
        </label>

        <label className="block">
          <span className={LABEL}>Business description</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={`${FIELD} resize-none`} placeholder="Tell customers what you're known for." />
        </label>

        {restaurant && (
          <div className="flex items-center gap-3 rounded-[18px] border border-line bg-surface px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="font-display text-[17px] font-medium leading-[23px] text-ink">Show store online</p>
              <p className="text-xs text-ink-secondary">Customers can view and order from the storefront.</p>
            </div>
            <button type="button" role="switch" aria-checked={isPublished} aria-label="Show store online"
              onClick={() => setIsPublished((v) => !v)}
              className={`relative h-[28px] w-[50px] shrink-0 rounded-full transition-colors ${isPublished ? "bg-success" : "bg-line"}`}>
              <span className={`absolute top-[3px] size-[22px] rounded-full bg-white shadow-sm transition-all ${isPublished ? "left-[25px]" : "left-[3px]"}`} />
            </button>
          </div>
        )}
      </form>

      {hoursSlot && (
        <section className="mt-6">
          <h2 className="font-display text-[19px] font-semibold leading-[25px] text-ink">Business hours</h2>
          <div className="mt-3">{hoursSlot}</div>
        </section>
      )}
    </DetailShell>
  );
}
