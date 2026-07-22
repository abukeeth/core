"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/owner-shell";
import { Icon } from "@/components/owner-icons";
import { createCoupon, deleteCoupon, listCoupons, updateCoupon, type Coupon } from "@/lib/owner-commerce-api";

/* Coupons & Promotions — Figma "Owner Dashboard V3 / Coupons & Promotions"
 * (node 204:30). Real coupon config from the coupons API; status tabs are
 * derived from isActive/startsAt/expiresAt. The mock's per-coupon redemption
 * counts and revenue are omitted — the coupons API doesn't expose them and
 * fabricating them is not allowed (a redemption-aggregation endpoint is the
 * follow-up). Full create/activate-pause/delete preserved. */

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
function discountDesc(c: Coupon): string {
  if (c.type === "FREE_DELIVERY") return "Free delivery";
  if (c.type === "PERCENTAGE") return `${c.value / 100}% off`;
  return `${money(c.value)} off`;
}
type Status = "active" | "scheduled" | "expired";
function statusOf(c: Coupon): Status {
  const now = Date.now();
  if (c.expiresAt && new Date(c.expiresAt).getTime() < now) return "expired";
  if (c.startsAt && new Date(c.startsAt).getTime() > now) return "scheduled";
  return "active";
}
const TABS: Array<[string, Status]> = [["Active", "active"], ["Scheduled", "scheduled"], ["Expired", "expired"]];

const FIELD = "w-full rounded-[12px] border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-brand";

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [tab, setTab] = useState<Status>("active");
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [code, setCode] = useState("");
  const [type, setType] = useState<Coupon["type"]>("PERCENTAGE");
  const [value, setValue] = useState("");
  const [minOrder, setMinOrder] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [maxPerCustomer, setMaxPerCustomer] = useState("");
  const [saving, setSaving] = useState(false);

  function refresh() {
    return listCoupons()
      .then((r) => setCoupons(r.coupons))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load coupons"));
  }
  useEffect(() => {
    let cancelled = false;
    listCoupons()
      .then((r) => { if (!cancelled) setCoupons(r.coupons); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load coupons"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const counts = useMemo(() => {
    const c = { active: 0, scheduled: 0, expired: 0 };
    for (const cp of coupons) c[statusOf(cp)]++;
    return c;
  }, [coupons]);
  const visible = useMemo(() => coupons.filter((c) => statusOf(c) === tab), [coupons, tab]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const numericValue = type === "FREE_DELIVERY" ? 0 : Math.round(Number(value) * 100);
      await createCoupon({
        code: code.toUpperCase(),
        type,
        value: numericValue,
        minOrderCents: minOrder ? Math.round(Number(minOrder) * 100) : undefined,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        maxRedemptions: maxRedemptions ? Number(maxRedemptions) : undefined,
        maxRedemptionsPerCustomer: maxPerCustomer ? Number(maxPerCustomer) : undefined,
      });
      setCode(""); setValue(""); setMinOrder(""); setExpiresAt(""); setMaxRedemptions(""); setMaxPerCustomer("");
      setShowCreate(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create coupon");
    } finally {
      setSaving(false);
    }
  }
  async function toggle(c: Coupon) {
    await updateCoupon(c.id, { isActive: !c.isActive });
    refresh();
  }
  async function remove(id: string) {
    await deleteCoupon(id);
    refresh();
  }

  return (
    <DashboardShell active="/dashboard/coupons">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-semibold leading-[34px] tracking-[-0.3px]">Coupons &amp; Promotions</h1>
          <p className="mt-0.5 text-xs text-ink-muted">Create offers that increase direct orders</p>
        </div>
        <button type="button" onClick={() => setShowCreate((s) => !s)} aria-label="New coupon"
          className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-brand text-white">
          <Icon name="plus" className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-4 flex gap-2">
        {TABS.map(([label, key]) => (
          <button key={key} type="button" onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition ${tab === key ? "bg-brand text-white" : "border border-line bg-surface text-ink-secondary"}`}>
            {label}<span className={`text-xs ${tab === key ? "text-white/70" : "text-ink-muted"}`}>{counts[key]}</span>
          </button>
        ))}
      </div>

      {error && <div className="mt-4 rounded-[18px] border border-danger/25 bg-danger/5 px-4 py-3 text-sm font-medium text-danger">{error}</div>}

      {/* Create */}
      {showCreate && (
        <form onSubmit={handleCreate} className="mt-4 space-y-2.5 rounded-[18px] border border-line bg-surface p-4">
          <div className="flex gap-2">
            <input required placeholder="WELCOME20" value={code} onChange={(e) => setCode(e.target.value)} className={`${FIELD} uppercase`} />
            <select value={type} onChange={(e) => setType(e.target.value as Coupon["type"])} className={FIELD}>
              <option value="PERCENTAGE">% off</option>
              <option value="FIXED_AMOUNT">$ off</option>
              <option value="FREE_DELIVERY">Free delivery</option>
            </select>
          </div>
          {type !== "FREE_DELIVERY" && (
            <input type="number" step="0.01" required placeholder={type === "PERCENTAGE" ? "Percent (e.g. 20)" : "Amount (e.g. 5.00)"} value={value} onChange={(e) => setValue(e.target.value)} className={FIELD} />
          )}
          <div className="grid grid-cols-2 gap-2">
            <input type="number" step="0.01" placeholder="Min order $" value={minOrder} onChange={(e) => setMinOrder(e.target.value)} className={FIELD} />
            <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={FIELD} />
            <input type="number" placeholder="Total limit" value={maxRedemptions} onChange={(e) => setMaxRedemptions(e.target.value)} className={FIELD} />
            <input type="number" placeholder="Per customer" value={maxPerCustomer} onChange={(e) => setMaxPerCustomer(e.target.value)} className={FIELD} />
          </div>
          <button type="submit" disabled={saving} className="w-full rounded-[14px] bg-brand px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "Creating…" : "Create coupon"}
          </button>
        </form>
      )}

      {/* List */}
      <div className="mt-4 space-y-2.5">
        {loading ? (
          [0, 1].map((i) => <div key={i} className="h-[104px] animate-pulse rounded-[18px] border border-line bg-surface" />)
        ) : visible.length === 0 ? (
          <div className="rounded-[18px] border border-line bg-surface px-4 py-10 text-center text-sm text-ink-secondary">No {tab} coupons.</div>
        ) : (
          visible.map((c) => {
            const paused = !c.isActive;
            return (
              <div key={c.id} className="rounded-[18px] border border-line bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-brand-soft px-2 py-1 text-xs font-semibold uppercase tracking-[0.1px] text-brand">{c.code}</span>
                      <span className="font-display text-[17px] font-medium text-ink">{discountDesc(c)}</span>
                    </div>
                    <p className="mt-1 text-xs text-ink-secondary">
                      {c.minOrderCents ? `Min. order ${money(c.minOrderCents)}` : "No minimum"}
                      {c.maxRedemptions ? ` · Limit ${c.maxRedemptions}` : ""}
                      {c.expiresAt ? ` · Ends ${new Date(c.expiresAt).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2px] ${paused ? "bg-subtle text-ink-muted" : "bg-success/10 text-success"}`}>
                    {paused ? "Paused" : "Active"}
                  </span>
                </div>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => toggle(c)}
                    className={`flex-1 rounded-[12px] px-4 py-2.5 text-sm font-semibold transition ${paused ? "bg-brand text-white" : "border border-line bg-surface text-ink"}`}>
                    {paused ? "Activate" : "Pause"}
                  </button>
                  <button type="button" onClick={() => remove(c.id)}
                    className="rounded-[12px] border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-danger transition">
                    Delete
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </DashboardShell>
  );
}
