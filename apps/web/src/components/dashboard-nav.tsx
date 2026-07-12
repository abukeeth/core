"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { DashboardDrawer } from "@/components/dashboard-drawer";

const MOBILE_ITEMS = [
  ["Overview", "/dashboard", "⌂"],
  ["Orders", "/dashboard/orders", "▤"],
  ["Menu", "/dashboard/menu", "▦"],
  ["AI", "/dashboard/builder", "✦"],
] as const;

const MORE_ITEMS = [
  ["Launch", "/dashboard/launch"],
  ["Import", "/dashboard/import"],
  ["AI Website Studio", "/dashboard/website"],
  ["Analytics", "/dashboard/analytics"],
  ["Restaurant", "/dashboard/restaurant"],
  ["Profile", "/dashboard/profile"],
] as const;

const DESKTOP_ITEMS = [
  ["Overview", "/dashboard"],
  ["Launch", "/dashboard/launch"],
  ["Orders", "/dashboard/orders"],
  ["Menu", "/dashboard/menu"],
  ["Import", "/dashboard/import"],
  ["AI Website Studio", "/dashboard/website"],
  ["Analytics", "/dashboard/analytics"],
  ["Restaurant", "/dashboard/restaurant"],
  ["Profile", "/dashboard/profile"],
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
}

export function DashboardNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MORE_ITEMS.some(([, href]) => isActive(pathname, href));

  return (
    <>
      <DashboardDrawer />

      <nav className="hidden items-center gap-2 overflow-x-auto rounded-2xl border border-[#E7DDCF] bg-white/90 p-2 text-sm font-semibold shadow-sm lg:flex">
        {DESKTOP_ITEMS.map(([label, href]) => {
          const active = pathname === href;
          return (
            <Link key={href} href={href} className={`whitespace-nowrap rounded-xl px-3 py-2 transition ${active ? "bg-[#171512] text-white" : "text-[#756B5D] hover:bg-[#F7F0E5] hover:text-[#171512]"}`}>
              {label}
            </Link>
          );
        })}
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="More navigation">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMoreOpen(false)}
            className="absolute inset-0 bg-black/30 backdrop-blur-[1px]"
          />
          <div className="absolute inset-x-0 bottom-20 mx-3 rounded-3xl border border-[#E7DDCF] bg-white p-3 shadow-[0_18px_50px_rgba(48,39,27,0.18)]">
            <div className="grid grid-cols-2 gap-2">
              {MORE_ITEMS.map(([label, href]) => {
                const active = isActive(pathname, href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMoreOpen(false)}
                    className={`min-h-12 rounded-2xl px-4 py-3 text-sm font-bold ${active ? "bg-[#171512] text-white" : "bg-[#F7F0E5] text-[#2A251F]"}`}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-[#E7DDCF] bg-white/96 px-1 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden">
        {MOBILE_ITEMS.map(([label, href, icon]) => {
          const active = isActive(pathname, href);
          return (
            <Link key={href} href={href} className={`flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[11px] font-semibold ${active ? "text-[#A9681F]" : "text-[#756B5D]"}`}>
              <span className="flex h-6 items-center justify-center text-lg leading-none" aria-hidden="true">{icon}</span>
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen((open) => !open)}
          aria-expanded={moreOpen}
          aria-label="More navigation"
          className={`flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[11px] font-semibold ${moreActive || moreOpen ? "text-[#A9681F]" : "text-[#756B5D]"}`}
        >
          <span className="flex h-6 items-center justify-center text-lg leading-none" aria-hidden="true">•••</span>
          <span className="truncate">More</span>
        </button>
      </nav>
    </>
  );
}
