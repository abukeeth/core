"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/owner-shell";
import { Icon, type IconName } from "@/components/owner-icons";
import { listOwnOrders, type OwnerOrder } from "@/lib/owner-commerce-api";

/* Orders list — Figma "Owner Dashboard V3 / Orders" (node 27:2). All data live
 * from listOwnOrders(); counts, tabs and search are derived client-side. */

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
function minutesSince(date: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60000));
}
function relativeTime(date: string) {
  const m = minutesSince(date);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

type Tone = "new" | "prep" | "ready" | "done" | "cancel";
function statusMeta(status: string): { label: string; tone: Tone } {
  const s = status.toUpperCase();
  if (s.includes("READY")) return { label: "Ready", tone: "ready" };
  if (s.includes("DELIVER")) return { label: "On the way", tone: "prep" };
  if (s.includes("PREPAR")) return { label: "Preparing", tone: "prep" };
  if (s.includes("COMPLETE")) return { label: "Completed", tone: "done" };
  if (s.includes("CANCEL") || s.includes("REFUND")) return { label: status.includes("REFUND") ? "Refunded" : "Cancelled", tone: "cancel" };
  return { label: "New", tone: "new" };
}
const PILL: Record<Tone, string> = {
  new: "bg-brand-soft text-brand",
  prep: "bg-info/10 text-info",
  ready: "bg-success/10 text-success",
  done: "bg-subtle text-ink-muted",
  cancel: "bg-danger/10 text-danger",
};
const ICON_TINT: Record<Tone, string> = {
  new: "bg-brand-soft text-brand",
  prep: "bg-info/10 text-info",
  ready: "bg-success/10 text-success",
  done: "bg-subtle text-ink-secondary",
  cancel: "bg-danger/10 text-danger",
};

function bucketOf(o: OwnerOrder): "active" | "completed" | "cancelled" {
  const s = o.status.toUpperCase();
  if (s.includes("CANCEL") || s.includes("REFUND")) return "cancelled";
  if (s.includes("COMPLETE")) return "completed";
  return "active";
}
function fulfillmentIcon(o: OwnerOrder): IconName {
  return o.fulfillmentType.toUpperCase().includes("DELIVER") ? "bike" : "bag";
}
function fulfillmentLabel(o: OwnerOrder) {
  const f = o.fulfillmentType.toUpperCase();
  if (f.includes("DELIVER")) return "Delivery";
  if (f.includes("DINE")) return "Dine-in";
  return "Pickup";
}
function paymentLabel(o: OwnerOrder) {
  const p = o.paymentStatus.toUpperCase();
  if (p.includes("PAID") || p.includes("CAPTURED") || p.includes("SUCCE")) return "Paid";
  if (p.includes("REFUND")) return "Refunded";
  if (p.includes("FAIL")) return "Payment failed";
  return "Payment pending";
}
function sourceLabel(o: OwnerOrder) {
  const s = o.source.toUpperCase();
  if (s.includes("QR")) return "QR table";
  if (s.includes("POS")) return "POS";
  if (s.includes("WEB") || s.includes("ONLINE") || s.includes("STORE")) return "Online";
  return o.source.replaceAll("_", " ").toLowerCase();
}
function isToday(date: string) {
  const d = new Date(date);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

const TABS: Array<["active" | "completed" | "cancelled", string]> = [
  ["active", "Active"], ["completed", "Completed"], ["cancelled", "Cancelled"],
];

export default function OrdersPage() {
  const [orders, setOrders] = useState<OwnerOrder[]>([]);
  const [tab, setTab] = useState<"active" | "completed" | "cancelled">("active");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listOwnOrders()
      .then((r) => { if (!cancelled) setOrders(r.orders); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load orders"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const counts = useMemo(() => {
    const c = { active: 0, completed: 0, cancelled: 0, today: 0 };
    for (const o of orders) {
      c[bucketOf(o)]++;
      if (isToday(o.placedAt)) c.today++;
    }
    return c;
  }, [orders]);

  const newestNew = useMemo(
    () => orders.filter((o) => statusMeta(o.status).tone === "new").sort((a, b) => +new Date(b.placedAt) - +new Date(a.placedAt))[0] ?? null,
    [orders],
  );

  const visible = useMemo(() => {
    const q = query.trim().replace(/^#/, "");
    return orders
      .filter((o) => bucketOf(o) === tab)
      .filter((o) => (q ? String(o.orderNumber).includes(q) : true))
      .sort((a, b) => +new Date(b.placedAt) - +new Date(a.placedAt));
  }, [orders, tab, query]);

  return (
    <DashboardShell active="/dashboard/orders">
      {/* Header */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-semibold leading-[34px] tracking-[-0.3px]">Orders</h1>
          <p className="mt-0.5 text-xs text-ink-muted">{counts.active} active · {counts.today} today</p>
        </div>
      </div>

      {/* Search */}
      <label className="mt-4 flex items-center gap-2.5 rounded-[16px] border border-line bg-surface px-3.5 py-3">
        <Icon name="search" className="h-[18px] w-[18px] text-ink-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          inputMode="numeric"
          placeholder="Search by order number"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
        />
      </label>

      {/* Tabs */}
      <div className="mt-3 flex gap-2">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition ${tab === key ? "bg-ink text-white" : "border border-line bg-surface text-ink-secondary"}`}>
            {label}
            <span className={`text-xs ${tab === key ? "text-white/70" : "text-ink-muted"}`}>{counts[key]}</span>
          </button>
        ))}
      </div>

      {error && <div className="mt-4 rounded-[18px] border border-danger/25 bg-danger/5 px-4 py-3 text-sm font-medium text-danger">{error}</div>}

      {/* New order waiting */}
      {newestNew && (
        <Link href={`/dashboard/orders/${newestNew.id}`}
          className="mt-4 flex items-center gap-3 rounded-[18px] border border-brand bg-brand-soft p-3.5">
          <span className="size-[11px] shrink-0 rounded-full bg-brand" />
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[17px] font-medium leading-[23px] text-ink">New order waiting</span>
            <span className="block text-xs text-ink-secondary">Order #{newestNew.orderNumber} arrived {relativeTime(newestNew.placedAt)}</span>
          </span>
          <span className="shrink-0 text-xs font-semibold text-brand">View</span>
        </Link>
      )}

      {/* List */}
      <div className="mt-4 space-y-2.5">
        {loading ? (
          <div className="space-y-2.5">
            {[0, 1, 2].map((i) => <div key={i} className="h-[92px] animate-pulse rounded-[18px] border border-line bg-surface" />)}
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-[18px] border border-line bg-surface px-4 py-10 text-center text-sm text-ink-secondary">
            {query ? "No orders match that number." : `No ${tab} orders.`}
          </div>
        ) : (
          visible.map((order) => {
            const meta = statusMeta(order.status);
            return (
              <Link key={order.id} href={`/dashboard/orders/${order.id}`}
                className="block rounded-[18px] border border-line bg-surface p-3.5 transition hover:border-brand/50">
                <div className="flex items-center gap-3">
                  <span className={`flex size-[42px] shrink-0 items-center justify-center rounded-[13px] ${ICON_TINT[meta.tone]}`}>
                    <Icon name={fulfillmentIcon(order)} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-[17px] font-medium leading-[23px] text-ink">#{order.orderNumber}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2px] ${PILL[meta.tone]}`}>{meta.label}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-secondary">{fulfillmentLabel(order)} · {relativeTime(order.placedAt)}</p>
                  </div>
                  <span className="shrink-0 font-display text-[17px] font-semibold text-ink">{money(order.totalCents)}</span>
                </div>
                <p className="mt-2 border-t border-line pt-2 text-[11px] font-medium text-ink-muted">{paymentLabel(order)} · {sourceLabel(order)}</p>
              </Link>
            );
          })
        )}
      </div>
    </DashboardShell>
  );
}
