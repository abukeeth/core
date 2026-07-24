/**
 * Client-readable feature flags.
 *
 * These are `NEXT_PUBLIC_*` env vars, inlined at build time, so they're safe to
 * read from client components. Every flag defaults OFF: a missing/blank value
 * must never turn a new experience on, so the existing, proven flow always
 * stays the default until an operator explicitly opts in.
 */

/** Truthy values an operator might set an on/off env var to. */
function isEnvEnabled(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes";
}

/**
 * Onboarding V3 — the 3-screen store-creation flow (Create → Analysis & Review
 * → Live Build + Ready) that replaces the 7-step Business Setup Wizard when
 * enabled. OFF by default: `/setup` keeps rendering the existing wizard until
 * `NEXT_PUBLIC_ONBOARDING_V3` is explicitly turned on, so there is no
 * regression for anyone mid-onboarding on the old flow.
 */
export function isOnboardingV3Enabled(): boolean {
  return isEnvEnabled(process.env.NEXT_PUBLIC_ONBOARDING_V3);
}
