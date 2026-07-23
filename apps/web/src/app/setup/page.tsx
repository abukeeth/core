"use client";

import { isOnboardingV3Enabled } from "@/lib/feature-flags";
import { LegacyWizard } from "./legacy-wizard";
import { OnboardingV3 } from "./v3/onboarding-v3";

/**
 * `/setup` entry point. Renders the Onboarding V3 flow when
 * `NEXT_PUBLIC_ONBOARDING_V3` is enabled, and otherwise the original 7-step
 * Business Setup Wizard. The flag defaults OFF, so this is a no-op for every
 * existing owner until an operator opts in.
 */
export default function BusinessSetupPage() {
  return isOnboardingV3Enabled() ? <OnboardingV3 /> : <LegacyWizard />;
}
