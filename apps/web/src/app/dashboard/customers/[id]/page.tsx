"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DetailShell } from "@/components/owner-shell";
import { initials } from "@/components/owner-icons";
import { getOwnCustomer, type OwnerCustomerDetail } from "@/lib/owner-commerce-api";

/* Customer profile — Figma "Owner Dashboard V3 / Customer Profile" (node
 * 38:124). Loyalty progress and customer notes from the mock are omitted:
 * there is no per-customer loyalty balance or notes field to back them, and
 * fabricating either would be mock data. Call/Email are real tel:/mailto: links. */

function money2(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
function orderDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fulfillmentLabel(type: string) {
  const f = type.toUpperCase();
  if (f.includes("DELIVER")) return "Delivery";
  if (f.includes("DINE")) return "Dine-in";
  return "Pickup";
}
type Tone = "new" | "prep" | "ready" | "done" | "cancel";
function statusMeta(status: string): { label: string; tone: Tone } {
  const s = status.toUpperCase();
  if (s.includes("READY")) return { label: "Ready", tone: "ready" };
  if (s.includes("DELIVER")) return { label: "On the way", tone: "prep" };
  if (s.includes("PREPAR")) return { label: "Preparing", tone: "prep" };
  if (s.includes("COMPLETE")) return { label: "Completed", tone: "done" };
  if (s.includes("CANCEL") || s.includes("REFUND")) return { label: "Cancelled", tone: "cancel" };
  return { label: "New", tone: "new" };
}
const TONE_TEXT: Record<Tone, string> = {
  new: "text-brand", prep: "text-info", ready: "text-success", done: "text-success", cancel: "text-danger",
};

export default function CustomerProfilePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [customer, setCustomer] = useState<OwnerCustomerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getOwnCustomer(id)
      .then((r) => { if (!cancelled) setCustomer(r.customer); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load customer"); });
    return () => { cancelled = true; };
  }, [id]);

  if (!customer) {
    return (
      <DetailShell title="Customer profile" backHref="/dashboard/customers">
        {error ? (
          <div className="rounded-[18px] border border-danger/25 bg-danger/5 px-4 py-3 text-sm font-medium text-danger">{error}</div>
        ) : (
          <div className="space-y-3">
            <div className="h-28 animate-pulse rounded-[18px] border border-line bg-surface" />
            <div className="h-24 animate-pulse rounded-[18px] border border-line bg-surface" />
          </div>
        )}
      </DetailShell>
    );
  }

  const m = customer.metrics;

  return (
    <DetailShell title="Customer profile" backHref="/dashboard/customers">
      {/* Identity */}
      <div className="flex flex-col items-center text-center">
        <span className="flex size-[68px] items-center justify-center rounded-[20px] bg-brand-soft font-display text-2xl font-semibold text-brand">
          {initials(customer.name)}
        </span>
        <h1 className="mt-3 font-display text-[26px] font-semibold leading-none tracking-[-0.3px]">{customer.name}</h1>
        <p className="mt-2 text-sm text-ink-secondary">
          {[customer.phone, customer.email].filter(Boolean).join(" · ")}
        </p>
      </div>

      {/* Contact actions */}
      <div className="mt-4 flex justify-center gap-2.5">
        {customer.phone && (
          <a href={`tel:${customer.phone}`} className="rounded-full border border-line bg-surface px-5 py-2 text-sm font-semibold text-ink">
            Call
          </a>
        )}
        <a href={`mailto:${customer.email}`} className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink">
          Email
        </a>
      </div>

      {/* Stats */}
      <div className="mt-4 grid grid-cols-3 gap-2.5">
        <div className="rounded-[17px] border border-line bg-surface p-3.5 text-center">
          <p className="font-display text-[22px] font-semibold leading-none text-ink">{m.orderCount}</p>
          <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.2px] text-ink-secondary">Orders</p>
        </div>
        <div className="rounded-[17px] border border-line bg-surface p-3.5 text-center">
          <p className="font-display text-[22px] font-semibold leading-none text-ink">{money2(m.totalSpentCents)}</p>
          <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.2px] text-ink-secondary">Lifetime</p>
        </div>
        <div className="rounded-[17px] border border-line bg-surface p-3.5 text-center">
          <p className="font-display text-[22px] font-semibold leading-none text-ink">{money2(m.avgOrderCents)}</p>
          <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.2px] text-ink-secondary">Avg. order</p>
        </div>
      </div>

      {/* Order history */}
      <div className="mt-5">
        <h2 className="font-display text-[19px] font-semibold leading-[25px] text-ink">Order history</h2>
        <div className="mt-3 space-y-2">
          {customer.orders.length === 0 ? (
            <p className="text-sm text-ink-secondary">No orders yet.</p>
          ) : customer.orders.map((o) => {
            const meta = statusMeta(o.status);
            return (
              <Link key={o.id} href={`/dashboard/orders/${o.id}`}
                className="flex items-center justify-between gap-3 rounded-[16px] border border-line bg-surface px-4 py-3 transition hover:border-brand/50">
                <div className="min-w-0">
                  <p className="font-display text-[15px] font-medium text-ink">#{o.orderNumber}</p>
                  <p className="text-xs text-ink-muted">{orderDate(o.placedAt)} · {fulfillmentLabel(o.fulfillmentType)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-ink">{money2(o.totalCents)}</p>
                  <p className={`text-[10px] font-semibold uppercase tracking-[0.2px] ${TONE_TEXT[meta.tone]}`}>{meta.label}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </DetailShell>
  );
}
