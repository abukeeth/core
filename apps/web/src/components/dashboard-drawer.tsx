"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ClipboardList,
  Globe,
  HelpCircle,
  LayoutDashboard,
  Megaphone,
  Menu as MenuIcon,
  Settings,
  Sparkles,
  UtensilsCrossed,
  Users,
  X,
} from "lucide-react";

type DrawerItem = {
  label: string;
  href: string | null;
  icon: typeof LayoutDashboard;
};

const DRAWER_ITEMS: DrawerItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Orders", href: "/dashboard/orders", icon: ClipboardList },
  { label: "Menu", href: "/dashboard/menu", icon: UtensilsCrossed },
  { label: "Customers", href: null, icon: Users },
  { label: "AI", href: "/dashboard/builder", icon: Sparkles },
  { label: "AI Website Studio", href: "/dashboard/website", icon: Globe },
  { label: "Marketing", href: null, icon: Megaphone },
  { label: "Settings", href: "/dashboard/restaurant", icon: Settings },
  { label: "Help", href: null, icon: HelpCircle },
];

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
}

export function DashboardDrawer() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#E7DDCF] bg-white text-[#171512] shadow-sm transition active:scale-95"
        >
          <MenuIcon className="h-5 w-5" aria-hidden="true" />
        </button>
        <span className="text-lg font-bold tracking-tight text-[#171512]">OrderVora</span>
        <span className="h-11 w-11" aria-hidden="true" />
      </div>

      <div
        className={`fixed inset-0 z-[60] lg:hidden ${open ? "" : "pointer-events-none"}`}
        role="dialog"
        aria-modal="true"
        aria-label="Main navigation"
      >
        <button
          type="button"
          aria-label="Close navigation menu"
          tabIndex={open ? 0 : -1}
          onClick={() => setOpen(false)}
          className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
        />
        <div
          className={`absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col bg-white pb-6 pt-[max(20px,env(safe-area-inset-top))] shadow-[0_24px_60px_rgba(48,39,27,0.25)] transition-transform duration-300 ease-out ${open ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="flex items-center justify-between px-5">
            <span className="text-lg font-bold tracking-tight text-[#171512]">OrderVora</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close navigation menu"
              tabIndex={open ? 0 : -1}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-[#756B5D] transition hover:bg-[#F7F0E5] hover:text-[#171512]"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <nav className="mt-6 flex flex-col gap-1 overflow-y-auto px-3">
            {DRAWER_ITEMS.map(({ label, href, icon: ItemIcon }) => {
              const active = href ? isActive(pathname, href) : false;
              if (!href) {
                return (
                  <span
                    key={label}
                    className="flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold text-[#B4A896]"
                  >
                    <ItemIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    {label}
                    <span className="ml-auto rounded-full bg-[#F7F0E5] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#9A8B74]">
                      Soon
                    </span>
                  </span>
                );
              }
              return (
                <Link
                  key={label}
                  href={href}
                  tabIndex={open ? 0 : -1}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold transition ${
                    active ? "bg-[#171512] text-white" : "text-[#2A251F] hover:bg-[#F7F0E5]"
                  }`}
                >
                  <ItemIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </>
  );
}
