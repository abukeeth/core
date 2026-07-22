"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DetailShell } from "@/components/owner-shell";
import { Icon, type IconName } from "@/components/owner-icons";
import { getFinancialSummary, type FinancialSummary } from "@/lib/owner-commerce-api";

/* Reports — Figma "Owner Dashboard V3 / Reports" (node 41:128).
 * Financial figures are real column sums from the financial-summary endpoint;
 * deltas compare the selected period to the one before it. The mock's
 * download + scheduled-reports controls are omitted (no export/scheduling
 * backend); "Available reports" link to the real detailed screens. */

const RANGES: Array<[string, number]> = [["Today", 1], ["7 days", 7], ["30 days", 30]];

function money2(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
function pctDelta(now: number, prev: number): number | null {
  if (prev <= 0) return null;
  return ((now - prev) / prev) * 100;
}

function DeltaText({ value }: { value: number | null }) {
  if (value === null) return null;
  const up = value >= 0;
  return <span className={`text-[11px] font-semibold ${up ? "text-success" : "text-danger"}`}>{up ? "+" : ""}{value.toFixed(1)}%</span>;
}

const REPORTS: Array<{ title: string; sub: string; href: string; icon: IconName }> = [
  { title: "Sales report", sub: "Revenue, orders, taxes and tips", href: "/dashboard/analytics", icon: "analytics" },
  { title: "Product performance", sub: "Top products and categories", href: "/dashboard/menu", icon: "products" },
  { title: "Customer report", sub: "Retention and lifetime value", href: "/dashboard/customers", icon: "customers" },
  { title: "Order report", sub: "Fulfillment, cancellations and timing", href: "/dashboard/orders", icon: "orders" },
];

export default function ReportsPage() {
  const [days, setDays] = useState(7);
  const [current, setCurrent] = useState<FinancialSummary | null>(null);
  const [previous, setPrevious] = useState<FinancialSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [a, b] = await Promise.allSettled([getFinancialSummary(days), getFinancialSummary(days * 2)]);
      if (cancelled) return;
      if (a.status === "fulfilled") setCurrent(a.value);
      if (a.status === "fulfilled" && b.status === "fulfilled") {
        const p = b.value;
        const c = a.value;
        setPrevious({
          grossCents: p.grossCents - c.grossCents,
          subtotalCents: p.subtotalCents - c.subtotalCents,
          taxCents: p.taxCents - c.taxCents,
          tipCents: p.tipCents - c.tipCents,
          discountCents: p.discountCents - c.discountCents,
          orderCount: p.orderCount - c.orderCount,
        });
      }
      setError(a.status === "rejected" ? "Could not load reports. Please refresh." : null);
    })();
    return () => { cancelled = true; };
  }, [days]);

  const rows = useMemo(() => {
    if (!current) return [];
    const net = current.subtotalCents - current.discountCents;
    const prevNet = previous ? previous.subtotalCents - previous.discountCents : 0;
    return [
      { label: "Gross sales", value: current.grossCents, delta: previous ? pctDelta(current.grossCents, previous.grossCents) : null },
      { label: "Net sales", value: net, delta: previous ? pctDelta(net, prevNet) : null },
      { label: "Taxes collected", value: current.taxCents, delta: previous ? pctDelta(current.taxCents, previous.taxCents) : null },
      { label: "Tips", value: current.tipCents, delta: previous ? pctDelta(current.tipCents, previous.tipCents) : null },
      { label: "Discounts", value: current.discountCents, delta: previous ? pctDelta(current.discountCents, previous.discountCents) : null },
    ];
  }, [current, previous]);

  return (
    <DetailShell title="Reports" backHref="/dashboard/analytics">
      <div>
        <h1 className="font-display text-[28px] font-semibold leading-[34px] tracking-[-0.3px]">Business reports</h1>
        <p className="mt-0.5 text-sm text-ink-secondary">Review accurate business data from your real orders.</p>
      </div>

      <div className="mt-4 flex gap-2">
        {RANGES.map(([label, value]) => (
          <button key={value} type="button" onClick={() => setDays(value)}
            className={`rounded-full px-3.5 py-2 text-sm font-semibold transition ${days === value ? "bg-ink text-white" : "border border-line bg-surface text-ink-secondary"}`}>
            {label}
          </button>
        ))}
      </div>

      {error && <div className="mt-4 rounded-[18px] border border-danger/25 bg-danger/5 px-4 py-3 text-sm font-medium text-danger">{error}</div>}

      {/* Summary */}
      <div className="mt-4 overflow-hidden rounded-[20px] bg-ink text-white">
        <p className="px-4 pt-4 text-[10px] font-semibold uppercase tracking-[0.2px] text-white/50">Summary · {current ? current.orderCount : 0} orders</p>
        <div className="mt-1 divide-y divide-white/10 px-4 pb-2">
          {rows.length === 0 ? (
            <p className="py-6 text-sm text-white/60">Loading…</p>
          ) : rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm text-white/80">{r.label}</p>
                <DeltaText value={r.delta} />
              </div>
              <p className="font-display text-[17px] font-semibold">{money2(r.value)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Available reports */}
      <h2 className="mt-6 font-display text-[19px] font-semibold leading-[25px] text-ink">Available reports</h2>
      <div className="mt-3 space-y-2.5">
        {REPORTS.map((r) => (
          <Link key={r.title} href={r.href} className="flex items-center gap-3 rounded-[18px] border border-line bg-surface p-3.5 transition hover:border-brand/50">
            <span className="flex size-[42px] shrink-0 items-center justify-center rounded-[13px] bg-brand-soft text-brand">
              <Icon name={r.icon} className="h-[21px] w-[21px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-[17px] font-medium leading-[23px] text-ink">{r.title}</span>
              <span className="block text-xs text-ink-secondary">{r.sub}</span>
            </span>
            <Icon name="chevron" className="h-[18px] w-[18px] shrink-0 text-ink-muted" />
          </Link>
        ))}
      </div>
    </DetailShell>
  );
}
