"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getKitchenCapacity,
  getRevenueSummary,
  getTopItems,
  listOwnOrders,
  updateKitchenCapacity,
  type OwnerOrder,
  type RevenueSummary,
  type TopItem,
} from "@/lib/owner-commerce-api";
import { getRestaurant, type Restaurant } from "@/lib/api";

/* ---------------------------------------------------------------------------
 * Owner Dashboard — Home / Overview
 * UI rebuilt to match Figma "Owner Dashboard V3 / Home" (node 33:4), mapped to
 * the OrderVora warm palette (Hybrid direction: V2 layout system + gold accent).
 * All data is live — orders, today's revenue pulse (with real period-over-period
 * deltas), the top-seller insight, and a real store-open toggle backed by the
 * kitchen "accepting orders" flag. No mock data.
 * ------------------------------------------------------------------------- */

type IconName =
  | "menu" | "search" | "bell" | "receipt" | "chevron" | "bag" | "bike"
  | "sparkles" | "plus" | "coupon" | "share" | "home" | "orders" | "products"
  | "customers" | "more" | "analytics" | "import" | "arrow" | "kds" | "website"
  | "staff" | "settings";

function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const paths: Record<IconName, React.ReactNode> = {
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3-3" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h5" /></>,
    chevron: <path d="m9 6 6 6-6 6" />,
    bag: <><path d="M6 8h12l-1 12H7L6 8Z" /><path d="M9 8a3 3 0 0 1 6 0" /></>,
    bike: <><circle cx="6" cy="17" r="3" /><circle cx="18" cy="17" r="3" /><path d="M6 17 10 7h5l2 5M9 17h6" /></>,
    sparkles: <><path d="M12 3.5 13.7 8.3 18.5 10 13.7 11.7 12 16.5 10.3 11.7 5.5 10 10.3 8.3 12 3.5Z" /><path d="M18.5 14.5 19.3 16.7 21.5 17.5 19.3 18.3 18.5 20.5 17.7 18.3 15.5 17.5 17.7 16.7 18.5 14.5Z" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    coupon: <><path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8Z" /><path d="M14 6v12" /></>,
    share: <><path d="M12 15V4M8 8l4-4 4 4" /><path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></>,
    home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></>,
    orders: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h6" /></>,
    products: <><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" /><path d="m3 8 9 5 9-5M12 13v8" /></>,
    customers: <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20c0-4 2.5-6 6-6s6 2 6 6M14 15c3.5 0 6 1.8 6 5" /></>,
    more: <><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></>,
    analytics: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
    import: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 20h14" /></>,
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    kds: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4M7 8h10M7 12h6" /></>,
    website: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>,
    staff: <><circle cx="12" cy="8" r="4" /><path d="M4 21c.5-5 3-7 8-7s7.5 2 8 7" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.5 4.5l2 2M17.5 17.5l2 2M2 12h3M19 12h3M4.5 19.5l2-2M17.5 6.5l2-2" /></>,
  };
  return <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...common}>{paths[name]}</svg>;
}

const DESKTOP_NAV: Array<[string, string]> = [
  ["Overview", "/dashboard"], ["Orders", "/dashboard/orders"], ["Products", "/dashboard/menu"],
  ["Customers", "/dashboard/customers"], ["Analytics", "/dashboard/analytics"],
  ["Website", "/dashboard/website"], ["Settings", "/dashboard/restaurant"],
];

const BOTTOM_TABS: Array<[string, string, IconName]> = [
  ["Home", "/dashboard", "home"], ["Orders", "/dashboard/orders", "orders"],
  ["Products", "/dashboard/menu", "products"], ["Customers", "/dashboard/customers", "customers"],
];

const MORE_ITEMS: Array<[string, string, IconName]> = [
  ["Analytics", "/dashboard/analytics", "analytics"], ["Import", "/dashboard/import", "import"],
  ["Launch", "/dashboard/launch", "arrow"], ["Coupons", "/dashboard/coupons", "coupon"],
  ["Loyalty", "/dashboard/loyalty", "sparkles"], ["Kitchen (KDS)", "/dashboard/kitchen", "kds"],
  ["Website", "/dashboard/website", "website"], ["Staff", "/dashboard/staff", "staff"],
  ["Settings", "/dashboard/restaurant", "settings"], ["Profile", "/dashboard/profile", "customers"],
];

const QUICK_ACTIONS: Array<[string, string, IconName]> = [
  ["Add product", "/dashboard/menu", "plus"],
  ["Create coupon", "/dashboard/coupons", "coupon"],
  ["Share store", "/dashboard/website", "share"],
];

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
function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "OV";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}
function greeting(d: Date) {
  const h = d.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
function pctDelta(now: number, prev: number): number | null {
  if (prev <= 0) return null;
  return ((now - prev) / prev) * 100;
}

type StatusTone = "new" | "prep" | "ready" | "done" | "cancel";
function statusMeta(status: string): { label: string; tone: StatusTone } {
  const s = status.toUpperCase();
  if (s.includes("READY")) return { label: "Ready", tone: "ready" };
  if (s.includes("DELIVER")) return { label: "On the way", tone: "prep" };
  if (s.includes("PREPAR")) return { label: "Preparing", tone: "prep" };
  if (s.includes("COMPLETE")) return { label: "Completed", tone: "done" };
  if (s.includes("CANCEL") || s.includes("REFUND")) return { label: "Cancelled", tone: "cancel" };
  return { label: "New", tone: "new" };
}
const TONE_TEXT: Record<StatusTone, string> = {
  new: "text-brand", prep: "text-info", ready: "text-success", done: "text-ink-muted", cancel: "text-danger",
};

function isActive(o: OwnerOrder) {
  const s = o.status.toUpperCase();
  return !s.includes("COMPLETE") && !s.includes("CANCEL") && !s.includes("REFUND");
}
function needsAttention(o: OwnerOrder) {
  const { tone } = statusMeta(o.status);
  return isActive(o) && (tone === "new" || tone === "prep");
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

/* -- small building blocks -------------------------------------------------- */

function SectionHeader({ title, action }: { title: string; action?: { label: string; href?: string; muted?: boolean } }) {
  return (
    <div className="flex w-full items-center justify-between">
      <h2 className="font-display text-[19px] font-semibold leading-[25px] text-ink">{title}</h2>
      {action && (action.href ? (
        <Link href={action.href} className={`text-xs font-semibold tracking-[0.1px] ${action.muted ? "text-ink-muted" : "text-brand"}`}>
          {action.label}
        </Link>
      ) : (
        <span className={`text-xs font-semibold tracking-[0.1px] ${action.muted ? "text-ink-muted" : "text-brand"}`}>{action.label}</span>
      ))}
    </div>
  );
}

function DeltaChip({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-ink-muted">New</span>;
  const up = value >= 0;
  return (
    <span className={`text-xs font-medium ${up ? "text-success" : "text-danger"}`}>
      {up ? "+" : ""}{value.toFixed(1)}%
    </span>
  );
}

/* -- page ------------------------------------------------------------------- */

export function DashboardOverview({ userName }: { userName: string }) {
  const [today, setToday] = useState<RevenueSummary | null>(null);
  const [twoDay, setTwoDay] = useState<RevenueSummary | null>(null);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [orders, setOrders] = useState<OwnerOrder[]>([]);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [accepting, setAccepting] = useState<boolean | null>(null);
  const [savingAccepting, setSavingAccepting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [rToday, rTwoDay, rTop, rOrders, rRestaurant, rKitchen] = await Promise.allSettled([
        getRevenueSummary(1),
        getRevenueSummary(2),
        getTopItems(7, 3),
        listOwnOrders(),
        getRestaurant(),
        getKitchenCapacity(),
      ]);
      if (cancelled) return;
      if (rToday.status === "fulfilled") setToday(rToday.value);
      if (rTwoDay.status === "fulfilled") setTwoDay(rTwoDay.value);
      if (rTop.status === "fulfilled") setTopItems(rTop.value.items);
      if (rOrders.status === "fulfilled") setOrders(rOrders.value.orders);
      if (rRestaurant.status === "fulfilled") setRestaurant(rRestaurant.value.restaurant);
      if (rKitchen.status === "fulfilled") setAccepting(rKitchen.value.kitchenCapacity.isAcceptingOrders);
      setError(rToday.status === "rejected" && rOrders.status === "rejected"
        ? "We couldn’t load your live business data. Please refresh."
        : null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const toggleAccepting = useCallback(async () => {
    if (accepting === null || savingAccepting) return;
    const next = !accepting;
    setAccepting(next);
    setSavingAccepting(true);
    try {
      const res = await updateKitchenCapacity({ isAcceptingOrders: next });
      setAccepting(res.kitchenCapacity.isAcceptingOrders);
    } catch {
      setAccepting(!next);
    } finally {
      setSavingAccepting(false);
    }
  }, [accepting, savingAccepting]);

  const now = useMemo(() => new Date(), []);
  const dateLabel = useMemo(
    () => `${now.toLocaleDateString("en-US", { weekday: "long" })} · ${now.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`,
    [now],
  );

  const activeOrders = useMemo(() => orders.filter(isActive), [orders]);
  const attention = useMemo(() => {
    const pending = orders.filter(needsAttention);
    const oldest = pending.reduce((max, o) => Math.max(max, minutesSince(o.placedAt)), 0);
    return { count: pending.length, oldest };
  }, [orders]);

  // Real day-over-day deltas: yesterday = (last-2-days total) − today.
  const yesterday = today && twoDay
    ? {
        revenue: twoDay.totalRevenueCents - today.totalRevenueCents,
        orders: twoDay.totalOrders - today.totalOrders,
      }
    : null;
  const yesterdayAov = yesterday && yesterday.orders > 0 ? Math.round(yesterday.revenue / yesterday.orders) : 0;

  const pulse = [
    {
      label: "Revenue",
      value: today ? money(today.totalRevenueCents) : "—",
      delta: today && yesterday ? pctDelta(today.totalRevenueCents, yesterday.revenue) : null,
    },
    {
      label: "Orders",
      value: today ? String(today.totalOrders) : "—",
      delta: today && yesterday ? pctDelta(today.totalOrders, yesterday.orders) : null,
    },
    {
      label: "Avg. order",
      value: today ? money(today.averageOrderValueCents) : "—",
      delta: today && yesterday ? pctDelta(today.averageOrderValueCents, yesterdayAov) : null,
    },
  ];

  const insight = topItems[0]
    ? {
        title: `${topItems[0].name} is your top seller`,
        body: `${topItems[0].quantitySold} sold this week · ${money(topItems[0].revenueCents)} in revenue.`,
      }
    : {
        title: "Insights are warming up",
        body: "Your business insights will appear here once orders start coming in.",
      };

  const storeName = restaurant?.name ?? "Your store";
  const storeOpen = accepting === true;

  return (
    <div className="min-h-screen bg-canvas text-ink">
      {/* Desktop top navigation */}
      <header className="sticky top-0 z-20 hidden border-b border-line bg-surface/85 backdrop-blur lg:block">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-8 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-brand font-display text-sm font-semibold text-white">O</span>
            <span className="font-display text-lg font-semibold tracking-[-0.2px]">OrderVora</span>
          </div>
          <nav className="flex items-center gap-1">
            {DESKTOP_NAV.map(([label, href], i) => (
              <Link key={href} href={href}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${i === 0 ? "bg-brand-soft text-brand" : "text-ink-secondary hover:bg-subtle hover:text-ink"}`}>
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[520px] px-5 pb-28 pt-4 lg:max-w-3xl lg:px-8 lg:pb-14 lg:pt-8">
        {/* Header row */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-label="Open menu"
            className="flex size-11 shrink-0 items-center justify-center rounded-[14px] border border-line bg-surface text-ink lg:hidden">
            <Icon name="menu" className="h-[21px] w-[21px]" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-[22px] font-semibold leading-[28px] tracking-[-0.2px]">
              {greeting(now)}, {userName.split(" ")[0]}
            </h1>
            <p className="text-xs text-ink-muted">{dateLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard/orders" aria-label="Search orders" className="flex size-[42px] items-center justify-center rounded-[14px] border border-line bg-surface text-ink">
              <Icon name="search" className="h-5 w-5" />
            </Link>
            <Link href="/dashboard/notifications" aria-label="Notifications" className="flex size-[42px] items-center justify-center rounded-[14px] border border-line bg-surface text-ink">
              <Icon name="bell" className="h-5 w-5" />
            </Link>
            <Link href="/dashboard/profile" aria-label="Your profile" className="flex size-[42px] items-center justify-center rounded-[14px] bg-brand-soft font-display text-xs font-semibold text-brand">
              {initials(userName)}
            </Link>
          </div>
        </div>

        {error && (
          <div className="mt-3.5 rounded-[18px] border border-danger/25 bg-danger/5 px-4 py-3 text-sm font-medium text-danger">
            {error}
          </div>
        )}

        {/* Orders needing attention */}
        <Link
          href="/dashboard/orders"
          className={`mt-3.5 flex w-full items-center gap-3 rounded-[18px] border p-3.5 transition ${
            attention.count > 0 ? "border-brand bg-brand-soft" : "border-line bg-surface"
          }`}>
          <span className={`flex size-[46px] shrink-0 items-center justify-center rounded-[14px] ${attention.count > 0 ? "bg-brand text-white" : "bg-subtle text-ink-secondary"}`}>
            <Icon name="receipt" className="h-[21px] w-[21px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[17px] font-medium leading-[23px] text-ink">
              {attention.count > 0 ? `${attention.count} order${attention.count === 1 ? "" : "s"} need attention` : "You’re all caught up"}
            </span>
            <span className="block text-xs text-ink-secondary">
              {attention.count > 0
                ? `Oldest order has waited ${attention.oldest} minute${attention.oldest === 1 ? "" : "s"}`
                : "No orders are waiting on you right now"}
            </span>
          </span>
          <Icon name="chevron" className="h-[18px] w-[18px] shrink-0 text-ink-muted" />
        </Link>

        {/* Store status */}
        <div className="mt-3.5 flex w-full items-center gap-3 rounded-[18px] border border-line bg-surface px-3.5 py-3">
          <span className={`size-[11px] shrink-0 rounded-full ${storeOpen ? "bg-success" : "bg-ink-muted"}`} />
          <div className="min-w-0 flex-1">
            <p className="font-display text-[17px] font-medium leading-[23px] text-ink">
              {storeName} {accepting === null ? "" : storeOpen ? "is open" : "is paused"}
            </p>
            <p className="text-xs text-ink-secondary">
              {accepting === null ? "Store status unavailable" : storeOpen ? "Accepting orders now" : "Not accepting orders"}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={storeOpen}
            aria-label="Toggle whether the store is accepting orders"
            onClick={toggleAccepting}
            disabled={accepting === null || savingAccepting}
            className={`relative h-[28px] w-[50px] shrink-0 rounded-full transition-colors disabled:opacity-50 ${storeOpen ? "bg-success" : "bg-line"}`}>
            <span className={`absolute top-[3px] size-[22px] rounded-full bg-white shadow-sm transition-all ${storeOpen ? "left-[25px]" : "left-[3px]"}`} />
          </button>
        </div>

        {/* Active orders */}
        <div className="mt-4 space-y-2.5">
          <SectionHeader title="Active orders" action={{ label: "View all", href: "/dashboard/orders" }} />
          {activeOrders.length === 0 ? (
            <div className="rounded-[17px] border border-line bg-surface px-4 py-6 text-center text-sm text-ink-secondary">
              {loading ? "Loading live orders…" : "No active orders right now."}
            </div>
          ) : (
            <div className="space-y-2">
              {activeOrders.slice(0, 5).map((order) => {
                const meta = statusMeta(order.status);
                const flagged = needsAttention(order);
                return (
                  <Link
                    key={order.id}
                    href={`/dashboard/orders/${order.id}`}
                    className={`flex items-center gap-3 rounded-[17px] border bg-surface px-3 py-2.5 transition hover:border-brand/50 ${flagged ? "border-brand" : "border-line"}`}>
                    <span className={`flex size-[46px] shrink-0 items-center justify-center rounded-[14px] ${flagged ? "bg-brand-soft text-brand" : "bg-subtle text-ink-secondary"}`}>
                      <Icon name={fulfillmentIcon(order)} className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-[17px] font-medium leading-[23px] text-ink">#{order.orderNumber}</span>
                      <span className="block text-xs text-ink-secondary">{fulfillmentLabel(order)} · {relativeTime(order.placedAt)}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-xs font-semibold tracking-[0.1px] text-ink">{money(order.totalCents)}</span>
                      <span className={`block text-[10px] font-semibold uppercase tracking-[0.2px] ${TONE_TEXT[meta.tone]}`}>{meta.label}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Business pulse */}
        <div className="mt-4 space-y-2.5">
          <SectionHeader title="Business pulse" action={{ label: "Today", muted: true }} />
          <div className="grid grid-cols-3 gap-2.5">
            {pulse.map((card) => (
              <div key={card.label} className="rounded-[17px] border border-line bg-surface p-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2px] text-ink-secondary">{card.label}</p>
                <p className="mt-1 font-display text-[19px] font-semibold leading-[25px] text-ink">{card.value}</p>
                <p className="mt-0.5"><DeltaChip value={card.delta} /></p>
              </div>
            ))}
          </div>
        </div>

        {/* Insight */}
        <Link
          href="/dashboard/analytics"
          className="mt-4 flex w-full items-center gap-3 rounded-[17px] border border-line bg-surface p-3.5 transition hover:border-brand/50">
          <span className="flex size-[42px] shrink-0 items-center justify-center rounded-[13px] bg-brand-soft text-brand">
            <Icon name="sparkles" className="h-[21px] w-[21px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[17px] font-medium leading-[23px] text-ink">{insight.title}</span>
            <span className="block text-xs text-ink-secondary">{insight.body}</span>
          </span>
          <Icon name="chevron" className="h-[18px] w-[18px] shrink-0 text-ink-muted" />
        </Link>

        {/* Quick actions */}
        <div className="mt-4 space-y-2.5">
          <SectionHeader title="Quick actions" />
          <div className="grid grid-cols-3 gap-2.5">
            {QUICK_ACTIONS.map(([label, href, icon]) => (
              <Link key={label} href={href}
                className="flex flex-col gap-2 rounded-[16px] border border-line bg-surface px-3 py-3 transition hover:border-brand/50">
                <span className="text-brand"><Icon name={icon} className="h-[21px] w-[21px]" /></span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.2px] text-ink">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </main>

      {/* Mobile "More" sheet */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="More navigation">
          <button type="button" aria-label="Close menu" onClick={() => setMoreOpen(false)} className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" />
          <div className="absolute inset-x-0 bottom-[86px] mx-3 rounded-[24px] border border-line bg-surface p-3 shadow-[var(--ov-elevation)]">
            <div className="grid grid-cols-2 gap-2">
              {MORE_ITEMS.map(([label, href, icon]) => (
                <Link key={href} href={href} onClick={() => setMoreOpen(false)}
                  className="flex min-h-12 items-center gap-2.5 rounded-[16px] bg-subtle px-3.5 py-3 text-sm font-semibold text-ink">
                  <span className="text-brand"><Icon name={icon} className="h-[18px] w-[18px]" /></span>
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between border-t border-line bg-surface/95 px-[18px] pb-[max(10px,env(safe-area-inset-bottom))] pt-2.5 backdrop-blur lg:hidden">
        {BOTTOM_TABS.map(([label, href, icon]) => (
          <Link key={href} href={href}
            className={`flex h-14 w-[58px] flex-col items-center justify-center gap-1 rounded-[14px] ${href === "/dashboard" ? "bg-brand-soft text-brand" : "text-ink-muted"}`}>
            <Icon name={icon} className="h-[21px] w-[21px]" />
            <span className="text-[10px] font-semibold tracking-[0.2px]">{label}</span>
          </Link>
        ))}
        <button type="button" onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen} aria-label="More navigation"
          className={`flex h-14 w-[58px] flex-col items-center justify-center gap-1 rounded-[14px] ${moreOpen ? "bg-brand-soft text-brand" : "text-ink-muted"}`}>
          <Icon name="more" className="h-[21px] w-[21px]" />
          <span className="text-[10px] font-semibold tracking-[0.2px]">More</span>
        </button>
      </nav>
    </div>
  );
}
