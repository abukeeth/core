"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/ui";
import { createCoupon, deleteCoupon, listCoupons, updateCoupon, type Coupon } from "@/lib/owner-commerce-api";

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [code, setCode] = useState("");
  const [type, setType] = useState<Coupon["type"]>("PERCENTAGE");
  const [value, setValue] = useState("");
  const [minOrder, setMinOrder] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [maxRedemptionsPerCustomer, setMaxRedemptionsPerCustomer] = useState("");
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    return listCoupons()
      .then((result) => setCoupons(result.coupons))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load coupons"));
  }

  useEffect(() => {
    let cancelled = false;
    listCoupons()
      .then((result) => {
        if (!cancelled) setCoupons(result.coupons);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load coupons");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    try {
      const numericValue = type === "FREE_DELIVERY" ? 0 : Math.round(Number(value) * (type === "PERCENTAGE" ? 100 : 100));
      await createCoupon({
        code,
        type,
        value: numericValue,
        minOrderCents: minOrder ? Math.round(Number(minOrder) * 100) : undefined,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        maxRedemptions: maxRedemptions ? Number(maxRedemptions) : undefined,
        maxRedemptionsPerCustomer: maxRedemptionsPerCustomer ? Number(maxRedemptionsPerCustomer) : undefined,
      });
      setCode("");
      setValue("");
      setMinOrder("");
      setExpiresAt("");
      setMaxRedemptions("");
      setMaxRedemptionsPerCustomer("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create coupon");
    }
  }

  async function handleToggle(coupon: Coupon) {
    await updateCoupon(coupon.id, { isActive: !coupon.isActive });
    refresh();
  }

  async function handleDelete(id: string) {
    await deleteCoupon(id);
    refresh();
  }

  return (
    <PageShell maxWidth="xl">
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Coupons</h1>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <form onSubmit={handleCreate} className="flex flex-col gap-2 rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-950">
          <div className="flex gap-2">
            <input
              type="text"
              required
              placeholder="CODE10"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="flex-1 rounded border border-black/[.08] px-3 py-2 text-sm uppercase dark:border-white/[.145] dark:bg-black"
            />
            <select
              value={type}
              onChange={(e) => setType(e.target.value as Coupon["type"])}
              className="rounded border border-black/[.08] px-3 py-2 text-sm dark:border-white/[.145] dark:bg-black"
            >
              <option value="PERCENTAGE">Percentage off</option>
              <option value="FIXED_AMOUNT">Fixed amount off</option>
              <option value="FREE_DELIVERY">Free delivery</option>
            </select>
          </div>
          {type !== "FREE_DELIVERY" && (
            <input
              type="number"
              required
              placeholder={type === "PERCENTAGE" ? "Percent (e.g. 10)" : "Dollar amount (e.g. 5.00)"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="rounded border border-black/[.08] px-3 py-2 text-sm dark:border-white/[.145] dark:bg-black"
            />
          )}

          <div className="mt-1 grid grid-cols-2 gap-2 border-t border-black/[.08] pt-3 dark:border-white/[.145]">
            <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
              Minimum order ($)
              <input
                type="number"
                step="0.01"
                min="0"
                value={minOrder}
                onChange={(e) => setMinOrder(e.target.value)}
                placeholder="No minimum"
                className="rounded border border-black/[.08] px-3 py-2 text-sm dark:border-white/[.145] dark:bg-black"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
              Expires on
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="rounded border border-black/[.08] px-3 py-2 text-sm dark:border-white/[.145] dark:bg-black"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
              Total redemption limit
              <input
                type="number"
                min="1"
                value={maxRedemptions}
                onChange={(e) => setMaxRedemptions(e.target.value)}
                placeholder="Unlimited"
                className="rounded border border-black/[.08] px-3 py-2 text-sm dark:border-white/[.145] dark:bg-black"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
              Limit per customer
              <input
                type="number"
                min="1"
                value={maxRedemptionsPerCustomer}
                onChange={(e) => setMaxRedemptionsPerCustomer(e.target.value)}
                placeholder="Unlimited"
                className="rounded border border-black/[.08] px-3 py-2 text-sm dark:border-white/[.145] dark:bg-black"
              />
            </label>
          </div>

          <button type="submit" className="mt-1 self-start rounded-full bg-foreground px-4 py-2 text-sm text-background">
            Create coupon
          </button>
        </form>

        <ul className="flex flex-col divide-y divide-black/[.08] rounded-lg border border-black/[.08] bg-white dark:divide-white/[.145] dark:border-white/[.145] dark:bg-zinc-950">
          {coupons.map((coupon) => (
            <li key={coupon.id} className="flex flex-col gap-1 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span>
                  {coupon.code} — {coupon.type} {coupon.type !== "FREE_DELIVERY" && coupon.value}
                  {!coupon.isActive && <span className="ml-2 text-xs text-zinc-500">(inactive)</span>}
                </span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => handleToggle(coupon)} className="text-zinc-600 dark:text-zinc-400">
                    {coupon.isActive ? "Deactivate" : "Activate"}
                  </button>
                  <button type="button" onClick={() => handleDelete(coupon.id)} className="text-red-600">
                    Delete
                  </button>
                </div>
              </div>
              {(coupon.minOrderCents || coupon.expiresAt || coupon.maxRedemptions || coupon.maxRedemptionsPerCustomer) && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {coupon.minOrderCents ? `Min order ${formatCents(coupon.minOrderCents)}. ` : ""}
                  {coupon.expiresAt ? `Expires ${new Date(coupon.expiresAt).toLocaleDateString()}. ` : ""}
                  {coupon.maxRedemptions ? `Limit ${coupon.maxRedemptions} total. ` : ""}
                  {coupon.maxRedemptionsPerCustomer ? `Limit ${coupon.maxRedemptionsPerCustomer} per customer.` : ""}
                </p>
              )}
            </li>
          ))}
          {coupons.length === 0 && <li className="p-4 text-zinc-500">No coupons yet.</li>}
        </ul>
    </PageShell>
  );
}
