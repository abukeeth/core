"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getRestaurant, isApiRequestError, type Restaurant } from "@/lib/api";
import { WizardShell } from "./wizard-shell";
import { BusinessTypeStep } from "./steps/business-type-step";
import { BusinessInfoStep } from "./steps/business-info-step";
import { LocationStep } from "./steps/location-step";
import { PaymentProviderStep } from "./steps/payment-provider-step";
import { MenuImportStep } from "./steps/menu-import-step";
import { WebsiteThemeStep } from "./steps/website-theme-step";
import { FinishStep } from "./steps/finish-step";

export default function BusinessSetupWizardPage() {
  const router = useRouter();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Only the async callbacks below touch state — nothing is set synchronously
  // in the effect body — so the initial `loading: true` carries the first
  // render and a transient failure resolves to a retry state instead of being
  // mistaken for a brand-new owner (Priority 1).
  const runLoad = useCallback(() => {
    let cancelled = false;
    getRestaurant()
      .then(({ restaurant: loaded }) => {
        if (!cancelled) setRestaurant(loaded);
      })
      .catch((err) => {
        if (cancelled) return;
        // Priority 1: only a definitive 404 means "no business yet" — step 1
        // (Business Type) then creates it. A 401 means the session is gone.
        // Anything else (5xx / timeout / network) is transient and must NOT
        // be treated as a fresh start: showing Business Type here would let
        // an existing owner try to re-create their business and hit a 409.
        if (isApiRequestError(err) && err.status === 404) {
          setRestaurant(null);
        } else if (isApiRequestError(err) && err.status === 401) {
          router.replace("/login");
        } else {
          setLoadError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => runLoad(), [runLoad]);

  function handleRetry() {
    setLoading(true);
    setLoadError(false);
    runLoad();
  }

  if (loading) {
    return (
      <main className="flex min-h-screen w-full items-center justify-center bg-canvas text-sm text-ink-secondary">
        Loading…
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="flex min-h-screen w-full items-center justify-center overflow-x-hidden bg-canvas px-4 py-8 text-ink">
        <div className="w-full max-w-md rounded-[24px] border border-line bg-surface p-6 text-center shadow-[var(--ov-elevation)] sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">SOMETHING WENT WRONG</p>
          <h1 className="mt-2 text-2xl font-display font-semibold tracking-tight">We couldn&apos;t load your setup</h1>
          <p className="mt-3 text-sm leading-6 text-ink-secondary">
            This is usually temporary. Check your connection and try again — your progress is saved.
          </p>
          <button
            type="button"
            onClick={handleRetry}
            className="mt-6 flex min-h-14 w-full items-center justify-center rounded-2xl bg-brand px-5 text-base font-bold text-white shadow-lg shadow-black/10 transition active:scale-[0.99]"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  const step = restaurant?.setupStep ?? "BUSINESS_TYPE";

  return (
    <WizardShell step={step}>
      {step === "BUSINESS_TYPE" && <BusinessTypeStep onDone={setRestaurant} />}
      {step === "BUSINESS_INFO" && restaurant && <BusinessInfoStep restaurant={restaurant} onDone={setRestaurant} />}
      {step === "LOCATION" && restaurant && <LocationStep restaurant={restaurant} onDone={setRestaurant} />}
      {step === "PAYMENT_PROVIDER" && <PaymentProviderStep onDone={setRestaurant} />}
      {step === "MENU_IMPORT" && <MenuImportStep onDone={setRestaurant} />}
      {step === "WEBSITE_THEME" && <WebsiteThemeStep onDone={setRestaurant} />}
      {step === "DONE" && <FinishStep />}
    </WizardShell>
  );
}
