import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import type { PublicUser, Restaurant } from "@/lib/api";
import { serverFetch, type ServerFetchResult } from "@/lib/server-api";
import { DashboardLoadError } from "./dashboard-load-error";
import { BillingBanner } from "./billing-banner";

type FetchFailure = Extract<ServerFetchResult<unknown>, { ok: false }>;

/** A definitive "not authenticated" — the session is missing/expired, so log in again. */
function isUnauthenticated(failure: FetchFailure): boolean {
  return failure.reason === "http" && failure.status === 401;
}

/** A definitive 404 — the resource genuinely does not exist (not a transient outage). */
function isDefinitelyMissing(failure: FetchFailure): boolean {
  return failure.reason === "http" && failure.status === 404;
}

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
 *
 * Priority 1 (production stability): the gate must distinguish *why* a
 * request failed. Only a definitive 404 on GET /api/restaurants/me means
 * "no business yet" → /setup. A 401 means the session is gone → /login. A
 * 5xx / timeout / network error is transient and must NOT be misread as a
 * brand-new owner (which previously bounced fully-onboarded owners back to
 * the start of setup, where creating a business then 409'd) — we show a
 * retry state instead of guessing.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const meResult = await serverFetch<{ user: PublicUser }>("/api/auth/me");
  if (!meResult.ok) {
    if (isUnauthenticated(meResult)) {
      redirect("/login");
    }
    return <DashboardLoadError />;
  }

  if (meResult.data.user.role === "RESTAURANT_OWNER") {
    const restaurantResult = await serverFetch<{ restaurant: Restaurant }>("/api/restaurants/me");
    if (restaurantResult.ok) {
      if (restaurantResult.data.restaurant.setupStep !== "DONE") {
        redirect("/setup");
      }
    } else if (isDefinitelyMissing(restaurantResult)) {
      redirect("/setup");
    } else if (isUnauthenticated(restaurantResult)) {
      redirect("/login");
    } else {
      return <DashboardLoadError />;
    }
    // Launch sprint — trial/subscription strip, owners only (admins and
    // staff have no platform subscription of their own).
    return (
      <>
        <BillingBanner />
        {children}
      </>
    );
  }

  return <>{children}</>;
}
