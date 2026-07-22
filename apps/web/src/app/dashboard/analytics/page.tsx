"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/owner-shell";
import { Icon } from "@/components/owner-icons";
import {
  getRevenueByDay,
  getRevenueSummary,
  getTopItems,
  type RevenueByDay,
  type RevenueSummary,
  type TopItem,
} from "@/lib/owner-commerce-api";

/* Analytics — Figma "Owner Dashboard V3 / Analytics" (node 41:6).
 * All figures live from the existing analytics endpoints; deltas are real
 * period-over-period comparisons (this range vs the preceding one). */

const RANGES: Array<[string, number]> = [["Today", 1], ["7 days", 7], ["30 days", 30]];

function money0(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}
function money2(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
function moneyCompact(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(cents / 100);
}
function pctDelta(now: number, prev: number): number | null {
  if (prev <= 0) return null;
  return ((now - prev) / prev) * 100;
}

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-ink-muted">No prior data</span>;
  const up = value >= 0;
  return <span className={`text-xs font-medium ${up ? "text-success" : "text-danger"}`}>{up ? "+" : ""}{value.toFixed(1)}%</span>;
}

function SalesTrend({ data }: { data: RevenueByDay[] }) {
  if (data.length === 0) {
    return <div className="flex h-40 items-center justify-center rounded-[14px] bg-subtle text-sm text-ink-secondary">No revenue in this range.</div>;
  }
  const W = 320, H = 130, PT = 12, PB = 22, PX = 6;
  const max = Math.max(1, ...data.map((d) => d.revenueCents));
  const n = data.length;
  const x = (i: number) => (n === 1 ? W / 2 : PX + (i / (n - 1)) * (W - PX * 2));
  const y = (v: number) => PT + (1 - v / max) * (H - PT - PB);
  const pts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.revenueCents).toFixed(1)}`);
  const area = `M ${x(0).toFixed(1)},${(H - PB).toFixed(1)} L ${pts.join(" L ")} L ${x(n - 1).toFixed(1)},${(H - PB).toFixed(1)} Z`;
  const showLabels = n <= 8;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full" preserveAspectRatio="none" role="img" aria-label="Sales trend">
      <defs>
        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--ov-brand)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--ov-brand)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#trendFill)" />
      <polyline points={pts.join(" ")} fill="none" stroke="var(--ov-brand)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(n - 1)} cy={y(data[n - 1].revenueCents)} r="3.5" fill="var(--ov-brand)" />
      {showLabels && data.map((d, i) => (
        <text key={String(d.day)} x={x(i)} y={H - 6} textAnchor="middle" className="fill-[color:var(--ov-ink-muted)]" fontSize="9">
          {new Date(d.day).toLocaleDateString("en-US", { weekday: "short" })}
        </text>
      ))}
    </svg>
  );
}

export default function AnalyticsPage() {
  const [days, setDays] = useState(7);
  const [summary, setSummary] = useState<RevenueSummary | null>(null);
  const [prev, setPrev] = useState<RevenueSummary | null>(null);
  const [byDay, setByDay] = useState<RevenueByDay[]>([]);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [s, s2, d, t] = await Promise.allSettled([
        getRevenueSummary(days),
        getRevenueSummary(days * 2),
        getRevenueByDay(days),
        getTopItems(days, 5),
      ]);
      if (cancelled) return;
      if (s.status === "fulfilled") setSummary(s.value);
      if (s2.status === "fulfilled" && s.status === "fulfilled") {
        setPrev({
          totalRevenueCents: s2.value.totalRevenueCents - s.value.totalRevenueCents,
          totalOrders: s2.value.totalOrders - s.value.totalOrders,
          averageOrderValueCents: 0,
          ordersByStatus: {},
        });
      }
      if (d.status === "fulfilled") setByDay(d.value.days);
      if (t.status === "fulfilled") setTopItems(t.value.items);
      setError(s.status === "rejected" ? "Could not load analytics. Please refresh." : null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [days]);

  const trendTotal = useMemo(() => byDay.reduce((sum, d) => sum + d.revenueCents, 0), [byDay]);
  const prevAov = prev && prev.totalOrders > 0 ? Math.round(prev.totalRevenueCents / prev.totalOrders) : 0;

  const cards = summary ? [
    { label: "Revenue", value: money0(summary.totalRevenueCents), delta: prev ? pctDelta(summary.totalRevenueCents, prev.totalRevenueCents) : null },
    { label: "Orders", value: String(summary.totalOrders), delta: prev ? pctDelta(summary.totalOrders, prev.totalOrders) : null },
    { label: "Avg. order", value: money2(summary.averageOrderValueCents), delta: prev ? pctDelta(summary.averageOrderValueCents, prevAov) : null },
  ] : [];

  return (
    <DashboardShell active="/dashboard/analytics">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-semibold leading-[34px] tracking-[-0.3px]">Analytics</h1>
          <p className="mt-0.5 text-xs text-ink-muted">Your business performance at a glance</p>
        </div>
        <Link href="/dashboard/reports" className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-2 text-sm font-semibold text-ink">
          <Icon name="analytics" className="h-4 w-4 text-brand" /> Reports
        </Link>
      </div>

      {/* Range */}
      <div className="mt-4 flex gap-2">
        {RANGES.map(([label, value]) => (
          <button key={value} type="button" onClick={() => setDays(value)}
            className={`rounded-full px-3.5 py-2 text-sm font-semibold transition ${days === value ? "bg-ink text-white" : "border border-line bg-surface text-ink-secondary"}`}>
            {label}
          </button>
        ))}
      </div>

      {error && <div className="mt-4 rounded-[18px] border border-danger/25 bg-danger/5 px-4 py-3 text-sm font-medium text-danger">{error}</div>}

      {/* Metric cards */}
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        {loading && !summary
          ? [0, 1, 2, 3].map((i) => <div key={i} className="h-[104px] animate-pulse rounded-[17px] border border-line bg-surface" />)
          : cards.map((c) => (
              <div key={c.label} className="rounded-[17px] border border-line bg-surface p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2px] text-ink-secondary">{c.label}</p>
                <p className="mt-1.5 font-display text-[26px] font-semibold leading-none tracking-[-0.3px] text-ink">{c.value}</p>
                <p className="mt-2"><Delta value={c.delta} /></p>
              </div>
            ))}
      </div>

      {/* Sales trend */}
      <div className="mt-4 rounded-[18px] border border-line bg-surface p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[17px] font-medium text-ink">Sales trend</h2>
          <span className="text-xs font-semibold text-brand">{moneyCompact(trendTotal)} total</span>
        </div>
        <div className="mt-3"><SalesTrend data={byDay} /></div>
      </div>

      {/* Top products */}
      <div className="mt-4 rounded-[18px] border border-line bg-surface p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[17px] font-medium text-ink">Top products</h2>
          <Link href="/dashboard/menu" className="text-xs font-semibold text-brand">View all</Link>
        </div>
        <ol className="mt-3 space-y-3">
          {topItems.length === 0 ? (
            <li className="text-sm text-ink-secondary">{loading ? "Loading…" : "No item sales in this range."}</li>
          ) : topItems.map((item, i) => (
            <li key={item.menuItemId} className="flex items-center gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-[11px] font-semibold text-brand">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{item.name}</span>
                <span className="block text-xs text-ink-muted">{item.quantitySold} orders</span>
              </span>
              <span className="shrink-0 text-sm font-semibold text-ink">{money0(item.revenueCents)}</span>
            </li>
          ))}
        </ol>
      </div>
    </DashboardShell>
  );
}
