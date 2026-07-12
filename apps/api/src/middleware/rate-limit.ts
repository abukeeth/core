import rateLimit from "express-rate-limit";
import { getNumberEnv } from "../config/env";
import { RedisRateLimitStore } from "../lib/redis-rate-limit-store";

// Production Hardening Phase 5 — every limiter below gets a Redis-backed
// store instead of express-rate-limit's default in-memory Map, so a
// limit is enforced across every instance sharing one Redis, not
// per-instance (PR-4). Each store fails open (see redis-rate-limit-
// store.ts) if REDIS_URL is unset or Redis is unreachable — a rate-
// limiter outage degrades to "not enforced," never to blocking
// legitimate traffic.
//
// Production Hardening Phase 11 — every threshold below is now overridable
// via `RATE_LIMIT_<NAME>_PER_MINUTE`, defaulting to the exact values
// already chosen in Sprint 07.6/07.7 (no behavior change for anyone who
// doesn't set one). This is what "revisit every rate-limit threshold...
// using real load-test data rather than the original estimates" (master
// spec Phase 11 work item 5) actually requires: a number that was
// hardcoded can't be revisited without a code change and a redeploy for
// every adjustment. It's also what let this phase's own load test measure
// the application/database's real throughput ceiling instead of just
// re-confirming the already-known 10/req-per-minute anti-abuse cap — see
// docs/reports/ProductionHardening/LOAD_TEST_RESULTS.md.
export const authRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: getNumberEnv("RATE_LIMIT_AUTH_PER_MINUTE", 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
  store: new RedisRateLimitStore("auth"),
});

export const importRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: getNumberEnv("RATE_LIMIT_IMPORT_PER_MINUTE", 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
  store: new RedisRateLimitStore("import"),
});

// Generation is the most expensive operation in the app (multiple LLM
// calls per request) — a tighter limit than the general import limiter.
export const siteGenerationRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: getNumberEnv("RATE_LIMIT_SITE_GENERATION_PER_MINUTE", 5),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
  store: new RedisRateLimitStore("site-generation"),
});

// Public, unauthenticated contact form — keyed by IP, tighter limit to
// blunt basic spam alongside the honeypot check (§27).
export const contactFormRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: getNumberEnv("RATE_LIMIT_CONTACT_FORM_PER_MINUTE", 5),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
  store: new RedisRateLimitStore("contact-form"),
});

// Commerce & Fulfillment Engine (Sprint 07) — customer (end-diner)
// register/login, same limit as staff auth.
export const customerAuthRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: getNumberEnv("RATE_LIMIT_CUSTOMER_AUTH_PER_MINUTE", 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
  store: new RedisRateLimitStore("customer-auth"),
});

// Order placement — the highest-value abuse target in the commerce
// engine (each request can trigger a real payment authorization).
export const checkoutRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: getNumberEnv("RATE_LIMIT_CHECKOUT_PER_MINUTE", 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
  store: new RedisRateLimitStore("checkout"),
});

// Public, unauthenticated table-QR resolution — keyed by IP.
export const publicCommerceRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: getNumberEnv("RATE_LIMIT_PUBLIC_COMMERCE_PER_MINUTE", 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
  store: new RedisRateLimitStore("public-commerce"),
});

// Payment provider webhooks (Sprint 07.7 H-13) — no caller identity exists
// pre-signature-verification, so this is IP-keyed like the other public
// limiters, but tuned looser: real webhook traffic can legitimately burst
// (e.g. a batch of retried events after an outage), unlike checkout.
export const webhookRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: getNumberEnv("RATE_LIMIT_WEBHOOK_PER_MINUTE", 100),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
  store: new RedisRateLimitStore("webhook"),
});

// Defense-in-depth for the authenticated staff-facing commerce surface
// (Sprint 07.7 H-14) — looser than the public-facing limiters since staff
// are already authenticated and legitimate dashboard usage can burst, but
// present as a throttle on a compromised/leaked session.
export const staffActionRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: getNumberEnv("RATE_LIMIT_STAFF_ACTION_PER_MINUTE", 60),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
  store: new RedisRateLimitStore("staff-action"),
});
