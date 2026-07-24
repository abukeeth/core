/**
 * Client-readable feature flags.
 *
 * These are `NEXT_PUBLIC_*` env vars, inlined at build time, so they're safe to
 * read from client components. Every flag defaults OFF: a missing/blank value
 * must never turn a new experience on, so the existing, proven flow always
 * stays the default until an operator explicitly opts in.
 */

/** Falsy values an operator might set an on/off env var to, to force a flag OFF. */
function isEnvDisabled(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "0" || normalized === "false" || normalized === "off" || normalized === "no";
}

/**
 * Onboarding V3 — the 3-screen store-creation flow (Create → Analysis & Review
 * → Live Build + Ready) that replaces the legacy 7-step Business Setup Wizard.
 *
 * ON by default. V3 is the shipped onboarding, so `/setup` renders it unless an
 * operator explicitly opts back into the legacy wizard by setting
 * `NEXT_PUBLIC_ONBOARDING_V3` to a falsy value (`0`/`false`/`off`/`no`). A
 * missing/blank value keeps V3 on — the previous default (OFF) meant a
 * production build with the var unset silently served the old wizard even
 * though V3 was merged, which is exactly the regression this inverts.
 */
export function isOnboardingV3Enabled(): boolean {
  return !isEnvDisabled(process.env.NEXT_PUBLIC_ONBOARDING_V3);
}
