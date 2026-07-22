"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon, type IconName } from "./owner-icons";

/* ---------------------------------------------------------------------------
 * Owner dashboard app shell — the persistent navigation chrome shared by every
 * owner screen in the Figma "Owner Dashboard V3" design: a desktop top nav, a
 * mobile bottom tab bar (Home / Orders / Products / Customers / More), and the
 * "More" sheet. Screens render their own header + content as children.
 * ------------------------------------------------------------------------- */

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

/* ---------------------------------------------------------------------------
 * Detail-screen shell — a drill-down layout (back header + optional sticky
 * action footer) used by order/product/customer detail & editor screens.
 * ------------------------------------------------------------------------- */
export function DetailShell({
  title,
  subtitle,
  backHref,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  backHref: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <Link href={backHref} aria-label="Back" className="flex size-10 shrink-0 items-center justify-center rounded-[12px] border border-line bg-surface text-ink">
            <Icon name="back" className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate font-display text-[19px] font-semibold leading-[25px] text-ink">{title}</p>
            {subtitle && <p className="truncate text-xs text-ink-muted">{subtitle}</p>}
          </div>
          <div className="size-10 shrink-0" aria-hidden="true" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl px-4 pb-32 pt-4">{children}</main>
      {footer && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center gap-3">{footer}</div>
        </div>
      )}
    </div>
  );
}

/** `active` should be the base route of the current tab, e.g. "/dashboard/orders". */
export function DashboardShell({
  active,
  children,
  maxWidth = "3xl",
}: {
  active: string;
  children: React.ReactNode;
  maxWidth?: "3xl" | "5xl";
}) {
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div className="min-h-screen bg-canvas text-ink">
      {/* Desktop top navigation */}
      <header className="sticky top-0 z-20 hidden border-b border-line bg-surface/85 backdrop-blur lg:block">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-8 py-3.5">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-brand font-display text-sm font-semibold text-white">O</span>
            <span className="font-display text-lg font-semibold tracking-[-0.2px]">OrderVora</span>
          </Link>
          <nav className="flex items-center gap-1">
            {DESKTOP_NAV.map(([label, href]) => (
              <Link key={href} href={href}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${href === active ? "bg-brand-soft text-brand" : "text-ink-secondary hover:bg-subtle hover:text-ink"}`}>
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className={`mx-auto w-full max-w-[520px] px-5 pb-28 pt-4 lg:px-8 lg:pb-14 lg:pt-8 ${maxWidth === "5xl" ? "lg:max-w-5xl" : "lg:max-w-3xl"}`}>
        {children}
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
            className={`flex h-14 w-[58px] flex-col items-center justify-center gap-1 rounded-[14px] ${href === active ? "bg-brand-soft text-brand" : "text-ink-muted"}`}>
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
