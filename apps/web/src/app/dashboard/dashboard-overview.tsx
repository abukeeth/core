"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DashboardDrawer } from "@/components/dashboard-drawer";
import {
  getRevenueByDay,
  getRevenueSummary,
  getTopItems,
  listOwnOrders,
  type OwnerOrder,
  type RevenueByDay,
  type RevenueSummary,
  type TopItem,
} from "@/lib/owner-commerce-api";

type IconName = "home" | "orders" | "menu" | "website" | "customers" | "marketing" | "analytics" | "staff" | "settings" | "revenue" | "average" | "product" | "coupon" | "import" | "kds" | "bell" | "arrow" | "more";

function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<IconName, React.ReactNode> = {
    home: <><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-7h6v7"/></>,
    orders: <><path d="M6 7h12l1 14H5L6 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/></>,
    menu: <><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M7 8h10M7 12h10M7 16h7"/></>,
    website: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></>,
    customers: <><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-4 2.5-6 6-6s6 2 6 6M14 15c3.5 0 6 1.8 6 5"/></>,
    marketing: <><path d="m4 13 12-6v10L4 11Z"/><path d="M16 9.5c2 .5 3 1.5 3 2.5s-1 2-3 2.5M6 13l1.5 6H11"/></>,
    analytics: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
    staff: <><circle cx="12" cy="7" r="4"/><path d="M4 21c.5-5 3-7 8-7s7.5 2 8 7"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.8 1.8 0 0 0 .4 2l.1.1-2.8 2.8-.1-.1a1.8 1.8 0 0 0-2-.4 1.8 1.8 0 0 0-1 1.6v.2h-4V21a1.8 1.8 0 0 0-1-1.6 1.8 1.8 0 0 0-2 .4l-.1.1-2.8-2.8.1-.1a1.8 1.8 0 0 0 .4-2A1.8 1.8 0 0 0 3 14H2.8v-4H3a1.8 1.8 0 0 0 1.6-1 1.8 1.8 0 0 0-.4-2l-.1-.1 2.8-2.8.1.1a1.8 1.8 0 0 0 2 .4A1.8 1.8 0 0 0 10 3V2.8h4V3a1.8 1.8 0 0 0 1 1.6 1.8 1.8 0 0 0 2-.4l.1-.1 2.8 2.8-.1.1a1.8 1.8 0 0 0-.4 2A1.8 1.8 0 0 0 21 10h.2v4H21a1.8 1.8 0 0 0-1.6 1Z"/></>,
    revenue: <><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5c-.8-1-2-1.5-3.5-1.5-2 0-3.5 1-3.5 2.5s1.2 2.1 3.8 2.6 3.7 1.2 3.7 2.7S14.4 17 12.2 17c-1.8 0-3.3-.6-4.2-1.7M12 5v14"/></>,
    average: <><path d="M4 19V5M4 19h16"/><path d="m7 15 4-4 3 2 5-6"/></>,
    product: <><path d="M5 7h14l-1 14H6L5 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/></>,
    coupon: <><path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2.5 2.5 0 0 0 0 5v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2.5 2.5 0 0 0 0-5V7Z"/><path d="m9 15 6-6M9 9h.01M15 15h.01"/></>,
    import: <><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 20h14"/></>,
    kds: <><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 22h8M12 18v4M7 8h10M7 12h7"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
    arrow: <><path d="M5 12h14M14 7l5 5-5 5"/></>,
    more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  };
  return <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...common}>{paths[name]}</svg>;
}

const NAV_ITEMS: Array<[string, string, IconName]> = [
  ["Dashboard", "/dashboard", "home"], ["Orders", "/dashboard/orders", "orders"], ["Menu", "/dashboard/menu", "menu"],
  ["AI Website Studio", "/dashboard/website", "website"], ["Customers", "/dashboard/customers", "customers"], ["Marketing", "/dashboard/marketing", "marketing"],
  ["Analytics", "/dashboard/analytics", "analytics"], ["Staff", "/dashboard/staff", "staff"], ["Settings", "/dashboard/restaurant", "settings"],
];

const MOBILE_TABS: Array<[string, string, IconName]> = [
  ["Home", "/dashboard", "home"], ["Orders", "/dashboard/orders", "orders"], ["Menu", "/dashboard/menu", "menu"], ["Studio", "/dashboard/website", "website"],
];

// Everything reachable from the desktop sidebar (NAV_ITEMS) or Quick Actions that doesn't
// already have its own mobile tab above — otherwise unreachable on mobile without this sheet.
const MORE_ITEMS: Array<[string, string, IconName]> = [
  ["Launch", "/dashboard/launch", "arrow"], ["Import", "/dashboard/import", "import"], ["Analytics", "/dashboard/analytics", "analytics"],
  ["Staff", "/dashboard/staff", "staff"], ["Restaurant", "/dashboard/restaurant", "settings"], ["Profile", "/dashboard/profile", "customers"],
];

const QUICK_ACTIONS: Array<[string, string, IconName]> = [
  ["Add product", "/dashboard/menu", "product"], ["Create coupon", "/dashboard/coupons", "coupon"], ["Import menu", "/dashboard/import", "import"],
  ["Open KDS", "/dashboard/kitchen", "kds"], ["Publish website", "/dashboard/website", "website"],
];

function money(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }
function relativeTime(date: string) { const minutes=Math.max(0,Math.floor((Date.now()-new Date(date).getTime())/60000)); if(minutes<1)return"just now"; if(minutes<60)return`${minutes}m ago`; const hours=Math.floor(minutes/60); return hours<24?`${hours}h ago`:`${Math.floor(hours/24)}d ago`; }
function statusClass(status:string){const v=status.toUpperCase();if(v.includes("READY")||v.includes("COMPLETE"))return"bg-emerald-50 text-emerald-700";if(v.includes("PREPAR"))return"bg-amber-50 text-amber-700";if(v.includes("CANCEL")||v.includes("DELAY"))return"bg-red-50 text-red-700";return"bg-[#F4E6D1] text-[#9A5F17]";}

function MetricCard({label,value,note,icon}:{label:string;value:string;note?:string;icon:IconName}){
  return <div className="rounded-[22px] border border-[#E7DDCF] bg-white p-4 shadow-[0_10px_30px_rgba(48,39,27,0.04)] sm:rounded-3xl sm:p-5">
    <div className="flex items-start justify-between gap-3"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8A7D6C] sm:text-xs">{label}</p><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F7EBDD] text-[#A9681F]"><Icon name={icon} className="h-[18px] w-[18px]"/></span></div>
    <p className="mt-2 text-[2rem] font-bold leading-none tracking-tight text-[#171512] sm:mt-3 sm:text-3xl">{value}</p>
    <p className="mt-3 text-xs font-medium text-emerald-700 sm:text-sm">{note??"Live business data"}</p>
  </div>;
}

export function DashboardOverview({userName}:{userName:string}){
  const [summary,setSummary]=useState<RevenueSummary|null>(null); const [byDay,setByDay]=useState<RevenueByDay[]>([]); const [topItems,setTopItems]=useState<TopItem[]>([]); const [orders,setOrders]=useState<OwnerOrder[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState<string|null>(null);
  const [moreOpen,setMoreOpen]=useState(false);
  useEffect(()=>{let cancelled=false;(async()=>{try{const [s,d,t,o]=await Promise.all([getRevenueSummary(7),getRevenueByDay(7),getTopItems(7,5),listOwnOrders()]);if(cancelled)return;setSummary(s);setByDay(d.days);setTopItems(t.items);setOrders(o.orders.slice(0,5));setError(null);}catch(e){if(!cancelled)setError(e instanceof Error?e.message:"Could not load dashboard data");}finally{if(!cancelled)setLoading(false);}})();return()=>{cancelled=true};},[]);
  const operations=useMemo(()=>{const c={New:0,Preparing:0,Ready:0,Delayed:0};for(const o of orders){const s=o.status.toUpperCase();if(s.includes("READY"))c.Ready++;else if(s.includes("PREPAR"))c.Preparing++;else if(s.includes("DELAY"))c.Delayed++;else if(!s.includes("COMPLETE")&&!s.includes("CANCEL"))c.New++;}return c;},[orders]);
  const maxRevenue=Math.max(1,...byDay.map(i=>i.revenueCents)); const insight=topItems[0]?`${topItems[0].name} is your leading item this week with ${topItems[0].quantitySold} sold and ${money(topItems[0].revenueCents)} in revenue.`:"Your AI business insights will appear here once you have enough order activity.";
  return <div className="min-h-screen bg-[#F7F0E5] text-[#171512] lg:grid lg:grid-cols-[240px_1fr]">
    <aside className="hidden min-h-screen bg-[#171512] px-4 py-7 text-white lg:flex lg:flex-col"><div className="px-3 text-2xl font-bold tracking-tight text-[#D8A24E]">OrderVora</div><nav className="mt-12 space-y-2">{NAV_ITEMS.map(([label,href,icon],i)=><Link key={href} href={href} className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${i===0?"bg-[#B97824] text-white":"text-[#D7D0C6] hover:bg-white/8 hover:text-white"}`}><Icon name={icon} className="h-[18px] w-[18px]"/>{label}</Link>)}</nav><div className="mt-auto rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-[#D7D0C6]"><p className="font-semibold text-white">Business command center</p><p className="mt-1 leading-5">Orders, menu, customers and growth in one place.</p></div></aside>
    <main className="min-w-0 overflow-x-hidden px-4 pb-28 pt-5 sm:px-6 lg:p-10">
      <DashboardDrawer />
      <header className="mt-4 flex items-start justify-between gap-3 lg:mt-0"><div className="min-w-0"><p className="text-xs font-semibold tracking-[0.12em] text-[#9A6A2F] sm:text-sm">BUSINESS OVERVIEW</p><h1 className="mt-1 text-[2rem] font-bold leading-tight tracking-tight sm:text-4xl">Good morning, {userName}.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#756B5D]">See what is happening now and what deserves your attention next.</p></div><button aria-label="Notifications" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#E7DDCF] bg-white text-[#171512] shadow-sm"><Icon name="bell"/></button></header>
      <Link href="/dashboard/orders" className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-[#171512] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-black/10">View live orders <Icon name="arrow" className="h-4 w-4"/></Link>
      {error&&<div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}{loading&&<div className="mt-6 text-sm font-medium text-[#756B5D]">Loading live business data…</div>}
      <section className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4"><MetricCard label="Revenue · 7 days" value={summary?money(summary.totalRevenueCents):"—"} icon="revenue"/><MetricCard label="Orders · 7 days" value={summary?String(summary.totalOrders):"—"} icon="orders"/><MetricCard label="Average order" value={summary?money(summary.averageOrderValueCents):"—"} icon="average"/><MetricCard label="Top item" value={topItems[0]?.name??"—"} note={topItems[0]?`${topItems[0].quantitySold} sold`:"Waiting for sales data"} icon="product"/></section>
      <section className="mt-4 rounded-3xl border border-[#E7DDCF] bg-white p-5 shadow-[0_12px_36px_rgba(48,39,27,0.04)]"><div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-bold">Live operations</h2><p className="mt-1 text-sm text-[#756B5D]">Current workload at a glance.</p></div><Link href="/dashboard/kitchen" className="flex items-center gap-1 text-sm font-semibold text-[#A9681F]">Open KDS <Icon name="arrow" className="h-4 w-4"/></Link></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{Object.entries(operations).map(([label,value])=><div key={label} className="rounded-2xl bg-[#FBF7F1] p-4"><p className="text-sm font-medium text-[#756B5D]">{label}</p><p className={`mt-2 text-3xl font-bold ${label==="Delayed"&&value>0?"text-red-700":"text-[#171512]"}`}>{value}</p></div>)}</div></section>
      <section className="mt-4 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]"><div className="rounded-3xl bg-[#171512] p-6 text-white shadow-xl shadow-black/10"><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold text-[#E1B56F]">AI Business Copilot</h2><span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-[#E9E0D4]">Insight</span></div><p className="mt-5 max-w-xl text-base leading-7 text-[#E9E0D4]">{insight}</p><Link href="/dashboard/analytics" className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-[#B97824] px-4 py-3 text-sm font-semibold text-white">Explore analytics <Icon name="arrow" className="h-4 w-4"/></Link></div>
      <div className="rounded-3xl border border-[#E7DDCF] bg-white p-6 shadow-[0_12px_36px_rgba(48,39,27,0.04)]"><div className="flex items-center justify-between"><div><h2 className="text-lg font-bold">Revenue overview</h2><p className="mt-1 text-sm text-[#756B5D]">Last 7 days</p></div><Link href="/dashboard/analytics" className="text-sm font-semibold text-[#A9681F]">Full report →</Link></div><div className="mt-6 flex h-40 items-end gap-2">{byDay.length===0?<div className="flex h-full w-full items-center justify-center rounded-2xl bg-[#FBF7F1] text-sm text-[#756B5D]">No order revenue yet.</div>:byDay.map((item,index)=><div key={`${item.day}-${index}`} className="flex flex-1 flex-col items-center justify-end gap-2"><div className="w-full rounded-t-xl bg-[#C98A37]" style={{height:`${Math.max(8,(item.revenueCents/maxRevenue)*120)}px`}} title={`${new Date(item.day).toLocaleDateString()}: ${money(item.revenueCents)}`}/><span className="text-[10px] font-medium text-[#8A7D6C]">{new Date(item.day).toLocaleDateString("en-US",{weekday:"short"})}</span></div>)}</div></div></section>
      <section className="mt-4 rounded-3xl border border-[#E7DDCF] bg-white p-5 shadow-[0_12px_36px_rgba(48,39,27,0.04)]"><h2 className="text-lg font-bold">Quick actions</h2><div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-5">{QUICK_ACTIONS.map(([label,href,icon],i)=><Link key={href} href={href} className={`flex items-center gap-3 rounded-2xl border px-4 py-4 text-sm font-semibold transition hover:-translate-y-0.5 ${i===0?"border-[#B97824] bg-[#B97824] text-white":"border-[#E7DDCF] bg-[#FBF7F1] text-[#2A251F] hover:bg-white"}`}><Icon name={icon} className="h-[18px] w-[18px]"/>{label}</Link>)}</div></section>
      <section className="mt-4 grid gap-4 xl:grid-cols-2"><div className="rounded-3xl border border-[#E7DDCF] bg-white p-5 shadow-[0_12px_36px_rgba(48,39,27,0.04)]"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">Top selling items</h2><Link href="/dashboard/analytics" className="text-sm font-semibold text-[#A9681F]">View all</Link></div><div className="mt-4 divide-y divide-[#EEE5D9]">{topItems.length===0?<p className="py-6 text-sm text-[#756B5D]">No sales data yet.</p>:topItems.map((item,index)=><div key={item.menuItemId} className="flex items-center justify-between gap-4 py-3"><div className="flex min-w-0 items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F4E6D1] text-sm font-bold text-[#9A5F17]">{index+1}</span><div className="min-w-0"><p className="truncate font-semibold">{item.name}</p><p className="text-xs text-[#8A7D6C]">{item.quantitySold} sold</p></div></div><span className="font-semibold">{money(item.revenueCents)}</span></div>)}</div></div>
      <div className="rounded-3xl border border-[#E7DDCF] bg-white p-5 shadow-[0_12px_36px_rgba(48,39,27,0.04)]"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">Recent orders</h2><Link href="/dashboard/orders" className="text-sm font-semibold text-[#A9681F]">View all</Link></div><div className="mt-4 divide-y divide-[#EEE5D9]">{orders.length===0?<p className="py-6 text-sm text-[#756B5D]">No orders yet.</p>:orders.map(order=><div key={order.id} className="flex items-center justify-between gap-4 py-3"><div><p className="font-semibold">#{order.orderNumber}</p><p className="text-xs text-[#8A7D6C]">{relativeTime(order.placedAt)}</p></div><div className="flex items-center gap-3"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(order.status)}`}>{order.status}</span><span className="font-semibold">{money(order.totalCents)}</span></div></div>)}</div></div></section>
    </main>
    {moreOpen&&<div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="More navigation">
      <button type="button" aria-label="Close menu" onClick={()=>setMoreOpen(false)} className="absolute inset-0 bg-black/30 backdrop-blur-[1px]"/>
      <div className="absolute inset-x-0 bottom-20 mx-3 rounded-3xl border border-[#E7DDCF] bg-white p-3 shadow-[0_18px_50px_rgba(48,39,27,0.18)]">
        <div className="grid grid-cols-2 gap-2">{MORE_ITEMS.map(([label,href,icon])=><Link key={href} href={href} onClick={()=>setMoreOpen(false)} className="flex min-h-12 items-center gap-2 rounded-2xl bg-[#F7F0E5] px-4 py-3 text-sm font-bold text-[#2A251F]"><Icon name={icon} className="h-[18px] w-[18px]"/>{label}</Link>)}</div>
      </div>
    </div>}
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-[#E7DDCF] bg-white/95 px-1 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden">
      {MOBILE_TABS.map(([label,href,icon])=><Link key={href} href={href} className={`flex flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[11px] font-semibold ${href==='/dashboard'?'text-[#A9681F]':'text-[#756B5D]'}`}><Icon name={icon} className="h-5 w-5"/><span>{label}</span></Link>)}
      <button type="button" onClick={()=>setMoreOpen((open)=>!open)} aria-expanded={moreOpen} aria-label="More navigation" className={`flex flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[11px] font-semibold ${moreOpen?'text-[#A9681F]':'text-[#756B5D]'}`}><Icon name="more" className="h-5 w-5"/><span>More</span></button>
    </nav>
  </div>;
}
