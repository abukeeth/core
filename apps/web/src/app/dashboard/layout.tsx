import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import type { PublicUser, Restaurant } from "@/lib/api";
import { serverFetch } from "@/lib/server-api";

/**
 * Every /dashboard/* page assumes an authenticated session, but before
 * this layout existed that assumption was only enforced ad hoc — e.g.
 * /dashboard/menu treated a 401 from GET /api/menu/categories the same
 * as "no restaurant yet" and showed "Set up your restaurant first"
 * instead of sending an expired/missing session back to /login. A
 * layout wraps every nested route automatically, so checking once here
 * closes that gap platform-wide instead of per-page.
 *
 * Sprint 18 — Business Setup Wizard: an owner with no business yet (or
 * one who closed the tab mid-setup) is sent to /setup instead of ever
 * reaching a dashboard page that assumes a business already exists. This
 * replaces the old pattern of manually visiting /dashboard/restaurant to
 * create one. Staff and admin accounts are never redirected — only the
 * owner who'd actually be running the wizard.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const result = await serverFetch<{ user: PublicUser }>("/api/auth/me");
  if (!result.ok) {
    redirect("/login");
  }

  if (result.data.user.role === "RESTAURANT_OWNER") {
    const restaurantResult = await serverFetch<{ restaurant: Restaurant }>("/api/restaurants/me");
    const setupStep = restaurantResult.ok ? restaurantResult.data.restaurant.setupStep : "BUSINESS_TYPE";
    if (setupStep !== "DONE") {
      redirect("/setup");
    }
  }

  return <>{children}</>;
}
