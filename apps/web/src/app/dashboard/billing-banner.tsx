"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getBillingSummary, type BillingSummary } from "@/lib/api";

/** Show the countdown only once it's genuinely near — a fresh 14-day trial shouldn't nag. */
const TRIAL_NAG_THRESHOLD_DAYS = 5;

/**
 * Launch sprint — the one dashboard-wide billing surface: a slim strip that
 * appears only when the owner actually needs to act (trial ending, trial
 * ended, payment failing, canceled). Silent for a healthy trial or an
 * active subscription, and silent on the billing page itself.
 */
export function BillingBanner() {
  const pathname = usePathname();
  const [billing, setBilling] = useState<BillingSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBillingSummary()
      .then(({ billing: loaded }) => {
        if (!cancelled) setBilling(loaded);
      })
      .catch(() => {
        // Billing being unreachable must never break the dashboard.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!billing || pathname?.startsWith("/dashboard/billing")) return null;

  let message: string | null = null;
  if (billing.state === "TRIALING" && billing.trialDaysLeft !== null && billing.trialDaysLeft <= TRIAL_NAG_THRESHOLD_DAYS) {
    message = billing.trialDaysLeft === 1 ? "Your free trial ends tomorrow." : `Your free trial ends in ${billing.trialDaysLeft} days.`;
  } else if (billing.state === "TRIAL_EXPIRED") {
    message = billing.enforcementEnabled
      ? "Your free trial has ended — your storefront is paused for new orders."
      : "Your free trial has ended.";
  } else if (billing.state === "PAST_DUE") {
    message = "Your last subscription payment failed — update your card.";
  } else if (billing.state === "CANCELED") {
    message = "Your subscription is canceled.";
  }

  if (!message) return null;

  const urgent = billing.state !== "TRIALING";
  return (
    <div
      data-testid="billing-banner"
      className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2.5 text-center text-sm font-semibold ${
        urgent ? "bg-[#7C2D12] text-[#FEF3EC]" : "bg-[#FDE9C8] text-[#7C5A1E]"
      }`}
    >
      <span>{message}</span>
      <Link href="/dashboard/billing" className="underline underline-offset-4">
        {billing.state === "TRIALING" || !billing.configured ? "View plan" : "Subscribe"}
      </Link>
    </div>
  );
}
