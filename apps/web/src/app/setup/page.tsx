"use client";

import { useEffect, useState } from "react";
import { getRestaurant, type Restaurant } from "@/lib/api";
import { WizardShell } from "./wizard-shell";
import { BusinessTypeStep } from "./steps/business-type-step";
import { BusinessInfoStep } from "./steps/business-info-step";
import { LocationStep } from "./steps/location-step";
import { PaymentProviderStep } from "./steps/payment-provider-step";
import { MenuImportStep } from "./steps/menu-import-step";
import { WebsiteThemeStep } from "./steps/website-theme-step";
import { FinishStep } from "./steps/finish-step";

export default function BusinessSetupWizardPage() {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getRestaurant()
      .then(({ restaurant: loaded }) => {
        if (!cancelled) setRestaurant(loaded);
      })
      .catch(() => {
        // No business yet — step 1 (Business Type) creates it.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-screen w-full items-center justify-center bg-[#F7F0E5] text-sm text-[#756B5D]">
        Loading…
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
