"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/owner-shell";
import { Icon, initials } from "@/components/owner-icons";
import { listOwnCustomers, type OwnerCustomer, type OwnerCustomerMetrics } from "@/lib/owner-commerce-api";

/* Customers — Figma "Owner Dashboard V3 / Customers" (node 38:6).
 * Data from the owner customers endpoint (derived from real orders). Segments
 * are deterministic classifications of real order counts / recency. */

function money2(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
function relativeDay(date: string | null) {
  if (!date) return "No orders yet";
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  if (days <= 0) return "Last order today";
  if (days === 1) return "Last order yesterday";
  if (days < 30) return `Last order ${days} days ago`;
  const months = Math.floor(days / 30);
  return `Last order ${months} mo ago`;
}

type Segment = "vip" | "returning" | "at-risk" | "new";
function segmentOf(c: OwnerCustomer): Segment {
  const daysSince = c.lastOrderAt ? (Date.now() - new Date(c.lastOrderAt).getTime()) / 86400000 : Infinity;
  if (daysSince > 30) return "at-risk";
  if (c.orderCount >= 5) return "vip";
  if (c.orderCount <= 1) return "new";
  return "returning";
}
const SEG_LABEL: Record<Segment, string> = { vip: "VIP", returning: "Returning", "at-risk": "At risk", new: "New" };
const SEG_PILL: Record<Segment, string> = {
  vip: "bg-brand-soft text-brand",
  returning: "bg-subtle text-ink-secondary",
  "at-risk": "bg-danger/10 text-danger",
  new: "bg-info/10 text-info",
};

const TABS: Array<[string, "all" | Segment]> = [["All", "all"], ["VIP", "vip"], ["At risk", "at-risk"], ["New", "new"]];

export default function CustomersPage() {
  const [customers, setCustomers] = useState<OwnerCustomer[]>([]);
  const [metrics, setMetrics] = useState<OwnerCustomerMetrics | null>(null);
  const [tab, setTab] = useState<"all" | Segment>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listOwnCustomers()
      .then((r) => { if (!cancelled) { setCustomers(r.customers); setMetrics(r.metrics); } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load customers"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers
      .filter((c) => (tab === "all" ? true : segmentOf(c) === tab))
      .filter((c) => (q ? `${c.name} ${c.email} ${c.phone ?? ""}`.toLowerCase().includes(q) : true));
  }, [customers, tab, query]);

  return (
    <DashboardShell active="/dashboard/customers">
      <div>
        <h1 className="font-display text-[28px] font-semibold leading-[34px] tracking-[-0.3px]">Customers</h1>
        <p className="mt-0.5 text-xs text-ink-muted">
          {metrics ? `${metrics.totalCustomers.toLocaleString()} customers · ${Math.round(metrics.returningRate * 100)}% returning` : "Loading…"}
        </p>
      </div>

      {/* Search */}
      <label className="mt-4 flex items-center gap-2.5 rounded-[16px] border border-line bg-surface px-3.5 py-3">
        <Icon name="search" className="h-[18px] w-[18px] text-ink-muted" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, phone or email"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted" />
      </label>

      {/* Metrics */}
      <div className="mt-3 grid grid-cols-3 gap-2.5">
        <div className="rounded-[17px] border border-line bg-surface p-3.5">
          <p className="font-display text-[19px] font-semibold leading-[25px] text-ink">{metrics ? money2(metrics.avgSpentCents) : "—"}</p>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.2px] text-ink-secondary">Avg. value</p>
        </div>
        <div className="rounded-[17px] border border-line bg-surface p-3.5">
          <p className="font-display text-[19px] font-semibold leading-[25px] text-ink">{metrics ? metrics.avgOrders.toFixed(1) : "—"}</p>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.2px] text-ink-secondary">Avg. orders</p>
        </div>
        <div className="rounded-[17px] border border-line bg-surface p-3.5">
          <p className="font-display text-[19px] font-semibold leading-[25px] text-ink">{metrics ? metrics.vipCount : "—"}</p>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.2px] text-ink-secondary">VIP customers</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-3 flex gap-2">
        {TABS.map(([label, key]) => (
          <button key={key} type="button" onClick={() => setTab(key)}
            className={`rounded-full px-3.5 py-2 text-sm font-semibold transition ${tab === key ? "bg-ink text-white" : "border border-line bg-surface text-ink-secondary"}`}>
            {label}
          </button>
        ))}
      </div>

      {error && <div className="mt-4 rounded-[18px] border border-danger/25 bg-danger/5 px-4 py-3 text-sm font-medium text-danger">{error}</div>}

      {/* List */}
      <div className="mt-4 space-y-2.5">
        {loading ? (
          [0, 1, 2, 3].map((i) => <div key={i} className="h-[84px] animate-pulse rounded-[18px] border border-line bg-surface" />)
        ) : visible.length === 0 ? (
          <div className="rounded-[18px] border border-line bg-surface px-4 py-10 text-center text-sm text-ink-secondary">
            {query || tab !== "all" ? "No customers match this filter." : "No customers yet — they'll appear here after their first order."}
          </div>
        ) : (
          visible.map((c) => {
            const seg = segmentOf(c);
            return (
              <Link key={`${c.kind}:${c.id}`} href={`/dashboard/customers/${c.id}`}
                className="flex items-center gap-3 rounded-[18px] border border-line bg-surface p-3.5 transition hover:border-brand/50">
                <span className="flex size-[46px] shrink-0 items-center justify-center rounded-[14px] bg-brand-soft font-display text-sm font-semibold text-brand">
                  {initials(c.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-display text-[17px] font-medium leading-[23px] text-ink">{c.name}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2px] ${SEG_PILL[seg]}`}>{SEG_LABEL[seg]}</span>
                  </div>
                  <p className="text-xs text-ink-secondary">{c.orderCount} order{c.orderCount === 1 ? "" : "s"} · {money2(c.totalSpentCents)} spent</p>
                  <p className="text-xs text-ink-muted">{relativeDay(c.lastOrderAt)}</p>
                </div>
                <Icon name="chevron" className="h-[18px] w-[18px] shrink-0 text-ink-muted" />
              </Link>
            );
          })
        )}
      </div>
    </DashboardShell>
  );
}
