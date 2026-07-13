import { getStringEnv } from "../config/env";

// The one customer-facing fallback host this platform ever displays or
// links to once a misconfigured/never-updated FRONTEND_URL is filtered out
// below. Shared by site.service.ts (storefront URLs) and auth.service.ts
// (password-reset/verification email links) — both read the exact same
// FRONTEND_URL env var and must never leak the same bad value into either.
const CANONICAL_FALLBACK_HOST = "https://www.ordervora.com";

// Real incident: an ops runbook once instructed pasting this exact value
// into Render's FRONTEND_URL "temporarily," and it was never corrected —
// see docs/reports/PRODUCTION_ENVIRONMENT_VALUES.md. Any of these
// substrings appearing in FRONTEND_URL means "not a real, reachable host."
const KNOWN_BAD_DOMAIN_FRAGMENTS = ["placeholder.example", "sites.ordervora.example", ".vercel.app", ".onrender.com"];

export function isKnownBadHost(hostOrUrl: string): boolean {
  const lower = hostOrUrl.toLowerCase();
  return KNOWN_BAD_DOMAIN_FRAGMENTS.some((bad) => lower.includes(bad));
}

/** Strips one or more trailing slashes so `${base}/some/path` can never produce a `//` from a base URL a human pasted with a trailing slash. */
export function stripTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * The safe FRONTEND_URL to build any customer-facing link from — sanitized
 * of a trailing slash, or replaced with the hardcoded canonical host if
 * FRONTEND_URL is unset, empty, or matches a known-bad placeholder value
 * that should never have reached production. This is what actually
 * enforces "the customer-facing fallback host is always
 * https://www.ordervora.com" as a code-level invariant rather than trusting
 * ops to have set FRONTEND_URL correctly.
 */
export function safeFrontendOrigin(): string {
  const trimmed = stripTrailingSlashes(getStringEnv("FRONTEND_URL", "http://localhost:3000").trim());
  if (!trimmed || isKnownBadHost(trimmed)) {
    return CANONICAL_FALLBACK_HOST;
  }
  return trimmed;
}
