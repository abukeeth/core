"use client";

import { isOnboardingV3Enabled } from "@/lib/feature-flags";
import { LegacyWizard } from "./legacy-wizard";
import { OnboardingV3 } from "./v3/onboarding-v3";

/**
 * `/setup` entry point. Renders the Onboarding V3 flow by default, and the
 * original 7-step Business Setup Wizard only when an operator explicitly opts
 * back into it via `NEXT_PUBLIC_ONBOARDING_V3=false`. V3 is the shipped
 * onboarding, so a production build with the var unset serves V3 (not the
 * legacy wizard).
 */
export default function BusinessSetupPage() {
  return isOnboardingV3Enabled() ? <OnboardingV3 /> : <LegacyWizard />;
}
