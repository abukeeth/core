"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/owner-shell";
import { Icon, type IconName } from "@/components/owner-icons";
import { listOwnNotifications, type OwnerNotification } from "@/lib/owner-commerce-api";

/* Notifications — Figma "Owner Dashboard V3 / Notifications Center" (node 65:16).
 * Real NotificationLog feed via the owner notifications endpoint. NotificationLog
 * has no read/unread state, so the mock's unread banner + "mark all read" are
 * omitted (not fabricated), as are the mock's non-existent notification types
 * (store-hours edits, campaign results, low-stock). */

type Category = "orders" | "payments" | "staff";
type Tone = "brand" | "info" | "success" | "danger" | "muted";

const META: Record<string, { title: string; category: Category; icon: IconName; tone: Tone }> = {
  ORDER_CONFIRMATION: { title: "Order confirmed", category: "orders", icon: "receipt", tone: "brand" },
  ORDER_READY: { title: "Order ready", category: "orders", icon: "bag", tone: "success" },
  ORDER_OUT_FOR_DELIVERY: { title: "Out for delivery", category: "orders", icon: "bike", tone: "info" },
  ORDER_DELIVERED: { title: "Order delivered", category: "orders", icon: "check", tone: "success" },
  NEW_ORDER_STAFF_ALERT: { title: "New order", category: "orders", icon: "receipt", tone: "brand" },
  PAYMENT_FAILED: { title: "Payment failed", category: "payments", icon: "bell", tone: "danger" },
  REFUND_ISSUED: { title: "Refund issued", category: "payments", icon: "coupon", tone: "info" },
  DRIVER_ASSIGNMENT_OFFER: { title: "Driver assignment offer", category: "staff", icon: "bike", tone: "info" },
  DRIVER_REASSIGNED_AWAY: { title: "Driver reassigned", category: "staff", icon: "bike", tone: "muted" },
  PASSWORD_RESET_REQUESTED: { title: "Password reset requested", category: "staff", icon: "settings", tone: "muted" },
  EMAIL_VERIFICATION_REQUESTED: { title: "Email verification requested", category: "staff", icon: "settings", tone: "muted" },
};
function humanize(s: string) {
  return s.replaceAll("_", " ").toLowerCase().replace(/\b\w/, (c) => c.toUpperCase());
}
function metaFor(type: string): { title: string; category: Category; icon: IconName; tone: Tone } {
  return META[type] ?? { title: humanize(type), category: "staff", icon: "bell", tone: "muted" };
}
const ICON_TINT: Record<Tone, string> = {
  brand: "bg-brand-soft text-brand",
  info: "bg-info/10 text-info",
  success: "bg-success/10 text-success",
  danger: "bg-danger/10 text-danger",
  muted: "bg-subtle text-ink-secondary",
};

function channelLabel(c: string) {
  const u = c.toUpperCase();
  return u === "SMS" ? "SMS" : u === "PUSH" ? "Push" : "Email";
}
function statusLabel(s: string) {
  const u = s.toUpperCase();
  if (u === "SENT") return "sent";
  if (u === "FAILED") return "failed to send";
  if (u.includes("SKIPPED")) return "channel off";
  return "queued";
}
function describe(n: OwnerNotification) {
  const parts: string[] = [];
  if (n.orderNumber != null) parts.push(`#${n.orderNumber}`);
  parts.push(`${channelLabel(n.channel)} · ${statusLabel(n.status)}`);
  return parts.join(" · ");
}
function relativeTime(iso: string) {
  const m = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function dayBucket(iso: string): string {
  const t = new Date(iso).getTime();
  const now = new Date(Date.now());
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (t >= startToday) return "Today";
  if (t >= startToday - 86400000) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

const TABS: Array<[string, "all" | Category]> = [["All", "all"], ["Orders", "orders"], ["Payments", "payments"], ["Staff", "staff"]];

export default function NotificationsPage() {
  const [items, setItems] = useState<OwnerNotification[]>([]);
  const [tab, setTab] = useState<"all" | Category>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listOwnNotifications()
      .then((r) => { if (!cancelled) setItems(r.notifications); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load notifications"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const groups = useMemo(() => {
    const visible = items.filter((n) => (tab === "all" ? true : metaFor(n.type).category === tab));
    const map = new Map<string, OwnerNotification[]>();
    for (const n of visible) {
      const b = dayBucket(n.createdAt);
      if (!map.has(b)) map.set(b, []);
      map.get(b)!.push(n);
    }
    return Array.from(map.entries());
  }, [items, tab]);

  return (
    <DashboardShell active="/dashboard/notifications">
      <div>
        <h1 className="font-display text-[28px] font-semibold leading-[34px] tracking-[-0.3px]">Notifications</h1>
        <p className="mt-0.5 text-xs text-ink-muted">Stay on top of important business activity</p>
      </div>

      {/* Tabs */}
      <div className="mt-4 flex gap-2">
        {TABS.map(([label, key]) => (
          <button key={key} type="button" onClick={() => setTab(key)}
            className={`rounded-full px-3.5 py-2 text-sm font-semibold transition ${tab === key ? "bg-ink text-white" : "border border-line bg-surface text-ink-secondary"}`}>
            {label}
          </button>
        ))}
      </div>

      {error && <div className="mt-4 rounded-[18px] border border-danger/25 bg-danger/5 px-4 py-3 text-sm font-medium text-danger">{error}</div>}

      {loading ? (
        <div className="mt-4 space-y-2.5">{[0, 1, 2].map((i) => <div key={i} className="h-[76px] animate-pulse rounded-[18px] border border-line bg-surface" />)}</div>
      ) : groups.length === 0 ? (
        <div className="mt-4 rounded-[18px] border border-line bg-surface px-4 py-10 text-center text-sm text-ink-secondary">
          {items.length === 0 ? "No notifications yet." : "No notifications in this filter."}
        </div>
      ) : (
        groups.map(([bucket, list]) => (
          <div key={bucket} className="mt-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2px] text-ink-muted">{bucket}</p>
            <div className="mt-2 space-y-2">
              {list.map((n) => {
                const meta = metaFor(n.type);
                const body = (
                  <div className="flex items-center gap-3 rounded-[18px] border border-line bg-surface p-3.5">
                    <span className={`flex size-[42px] shrink-0 items-center justify-center rounded-[13px] ${ICON_TINT[meta.tone]}`}>
                      <Icon name={meta.icon} className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-[15px] font-medium leading-[21px] text-ink">{meta.title}</p>
                      <p className="truncate text-xs text-ink-secondary">{describe(n)}</p>
                      <p className="text-[11px] text-ink-muted">{relativeTime(n.createdAt)}</p>
                    </div>
                    {n.orderId && <Icon name="chevron" className="h-[18px] w-[18px] shrink-0 text-ink-muted" />}
                  </div>
                );
                return n.orderId
                  ? <Link key={n.id} href={`/dashboard/orders/${n.orderId}`} className="block transition hover:opacity-90">{body}</Link>
                  : <div key={n.id}>{body}</div>;
              })}
            </div>
          </div>
        ))
      )}
    </DashboardShell>
  );
}
