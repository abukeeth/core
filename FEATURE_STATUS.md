# FEATURE STATUS — OrderVora

> Every feature with a status, derived from a code-level discovery pass
> (backend modules, Prisma schema, web app) plus the full test suites
> (API 1627 passed / 5 skipped, Web 287 passed). This measures the system on
> **its own stack** (Express + Prisma + PostgreSQL + Next.js), not against any
> alternative architecture.

## Status legend

| Label | Meaning |
|---|---|
| ✅ **Works** | Implemented end-to-end with real logic and tests; production-usable subject to config. |
| 🟡 **Experimental / Partial** | Real implementation but incomplete, or behind a default-off flag. |
| 🔩 **Stub** | Interface/adapter registered but returns "not implemented"; a placeholder for later. |
| ⛔ **Not started** | No implementation. |
| 🚀 **Launch-ready** | Works AND is needed/safe for the first-customer pilot. |

---

## Identity, auth & access

| Feature | Status | Notes |
|---|---|---|
| Owner/staff registration & login | ✅ 🚀 | JWT in httpOnly cookies, rotating refresh w/ theft detection. |
| Password reset / email verification | ✅ 🚀 | Single-use hashed tokens. |
| Remember-me, logout-all, change password | ✅ 🚀 | |
| Role model (ADMIN / RESTAURANT_OWNER / RESTAURANT_STAFF) | ✅ 🚀 | Enforced via `requireRole`. |
| Customer (diner) accounts | ✅ 🚀 | Separate trust domain + cookies. |
| Guest checkout identity | ✅ 🚀 | Passwordless `GuestCustomer`. |
| Membership layer (OWNER/MANAGER/KITCHEN/MARKETING/…) | 🟡 | Modeled + backfilled but **flag-off**, not yet the authz source. |
| Tenant-context + kitchen financial firewall | 🟡 | Present behind `TENANT_CONTEXT_ENABLED` / `KITCHEN_FIREWALL` (default off/observe). |
| MFA for admin | ⛔ | No TOTP/2FA. Post-launch. |

## Business setup & onboarding

| Feature | Status | Notes |
|---|---|---|
| 7-step Business Setup Wizard | ✅ 🚀 | `SetupStep` state machine. Default onboarding. |
| Onboarding V3 (3-screen: create → review → build) | 🟡 | Full stack behind `NEXT_PUBLIC_ONBOARDING_V3` (default OFF). Reuses consolidated import + builder + QR; legacy wizard preserved as the default. |
| Consolidated multi-source import (`MULTI`) | ✅ | Best-N images + PDFs + website/Google URLs merged into one reviewable extraction; `POST /api/imports/consolidated`. |
| Resume onboarding across devices | ✅ 🚀 | `OnboardingStatus`; V3 additionally re-derives its screen from live store + import-job state. |
| Business types (9 verticals) | ✅ 🚀 | RESTAURANT…RETAIL, OTHER. |
| Organization layer above Business | 🟡 | 1:1 with restaurant today (P1); nullable `organizationId`. |

## Menu & catalog

| Feature | Status | Notes |
|---|---|---|
| Categories / items / images | ✅ 🚀 | |
| Modifiers (groups/options), variants | ✅ 🚀 | |
| Inventory / "86" an item | ✅ 🚀 | Opt-in stock. |
| Public menu API | ✅ 🚀 | |

## Menu import (AI)

| Feature | Status | Notes |
|---|---|---|
| Image / PDF / CSV import | ✅ 🚀 | AI vision extraction → structured review. Needs an AI provider key. |
| Website scrape import | ✅ | |
| Google Maps / Business import | ✅ 🟡 | Needs `GOOGLE_MAPS_API_KEY`. |
| DoorDash / UberEats / Grubhub import | 🔩 | Adapters throw NotImplemented (501). |
| Import review (bulk approve/reject) | ✅ 🚀 | Durable jobs w/ heartbeat + reaper. |

## Commerce (core — strongest area)

| Feature | Status | Notes |
|---|---|---|
| Cart (guest + account) | ✅ 🚀 | |
| Checkout quote (tax/fees/eligibility) | ✅ 🚀 | Smart Routing eligibility gate. |
| Order placement + state machine | ✅ 🚀 | `OrderStatus`/`Payment`/`Fulfillment` tri-status, order events/timeline. |
| Pickup | ✅ 🚀 | Default-on for a fresh restaurant. |
| QR dine-in | ✅ 🚀 | Table token attribution. |
| Coupons & gift cards | ✅ 🚀 | |
| Loyalty (program/accounts/txns) | ✅ 🚀 | |
| Reviews (one per order) | ✅ 🚀 | |
| Tax / service-fee / delivery-fee rules | ✅ 🚀 | Config engine is real. |

## Payments

| Feature | Status | Notes |
|---|---|---|
| Stripe (BYOP — merchant's own keys) | ✅ 🚀 | Real intents, capture/cancel, refunds; per-provider encrypted creds. |
| Webhook signature verification | ✅ 🚀 | Raw-body verify, idempotent. |
| Adyen / Authorize.net / Clover / Fiserv / Square | 🔩 | Registered stubs; connect is rejected. UI shows "coming soon". |

## Delivery & fulfillment

| Feature | Status | Notes |
|---|---|---|
| Restaurant's own driver | ✅ 🚀 | Assign staff → accept → picked-up → delivered, live location ping, stale-offer expiry. |
| Delivery config (enable, radius, zones, rules) | ✅ 🚀 | |
| Delivery-method availability gate | ✅ 🚀 | **This PR:** rules can't route to a stub provider; re-enables automatically when adapters ship. |
| Uber Direct / DoorDash Drive / Local Courier | 🔩 | Adapters throw NotImplemented; kept for later, cannot be selected now. |

## Website builder / storefront

| Feature | Status | Notes |
|---|---|---|
| Generation pipeline (V1) | ✅ 🚀 | Ingest → brand → theme → content → assemble → render. |
| Renderer (hero, menu, featured, gallery, reviews, SEO/JSON-LD/sitemap/OG) | ✅ 🚀 | ~40 modules; pure function of RenderContext. |
| Versioning, preview tokens, approve-before-publish | ✅ 🚀 | |
| Publishing engine | ✅ 🚀 | Leaves a fresh DRAFT after publish (prior bug fixed). |
| Custom domains (attach/verify/primary) | 🟡 | Domain records work… |
| Custom-domain TLS (ACME/Let's Encrypt) | 🔩 | Issuance is a stub — **pilot stays on platform subdomain**. |
| Site scoring (SEO/a11y/perf/brand/conversion) | ✅ | |
| Customization Studio (live preview, sections, brand/header/footer) | ✅ 🚀 | |
| Generation V2 (three original briefs, no themes) | 🟡 | P0–P3 landed, **shadow mode, off by default**; not wired into web UI. |
| Bilingual EN/AR generation, AI product-image gen | ⛔ | Post-launch. |

## Notifications

| Feature | Status | Notes |
|---|---|---|
| Transactional email (SMTP) | ✅ 🚀 | Order lifecycle emails. |
| Owner notifications feed | ✅ 🚀 | Reads real `NotificationLog`. |
| SMS (Twilio) | 🔩 | Stub (soft-fails, never promised in UI). |
| Push | 🔩 | Stub. |

## Analytics & admin

| Feature | Status | Notes |
|---|---|---|
| Owner analytics (sales/revenue/top items/financial) | ✅ 🚀 | |
| Platform admin (list/suspend restaurants, audit log) | ✅ 🚀 | |
| Reports, reviews moderation, customers CRM list | ✅ 🚀 | |

## POS integrations

| Feature | Status | Notes |
|---|---|---|
| Square / Clover / Toast / Lightspeed / Generic | 🔩 | All adapters stubs; UI "coming soon". Post-launch. |

## Monetization

| Feature | Status | Notes |
|---|---|---|
| Subscriptions / Stripe Billing (Starter/Growth/Pro) | ⛔ | Not started. **Pilot bills manually** — not a launch blocker. |
| Referral program (tracking) | ✅ 🟡 | Tracking works; rewards depend on billing. |

## Platform / reliability (infrastructure)

| Feature | Status | Notes |
|---|---|---|
| Transactional outbox, idempotency keys | ✅ 🚀 | |
| Job durability (claim/heartbeat/reaper) | ✅ 🚀 | |
| Rate limiting (9 limiters, Redis-backed, fail-open) | ✅ 🚀 | |
| Fraud signals | ✅ | |
| Health `/health` + readiness `/ready` + `/metrics` | ✅ 🚀 | |
| Structured logging (pino) + Sentry + Prometheus | ✅ 🚀 | |
| Persistent object storage (S3/R2) | ✅ 🚀 | Code enforces it in prod; **must be configured on Railway** (env, not code). |
| Multi-tenant isolation | 🟡 | Application-layer `restaurantId` scoping (no DB RLS). Fine for pilot; harden at scale. |
| Realtime (KDS/tracking) | 🟡 | Polling, not push. Acceptable for pilot. |
| Automated deploy | 🟡 | CI enforces lint/typecheck/test/build; deploy step is manual (Railway/Vercel). |

---

## Launch-ready slice (pilot)

Everything a first business needs is ✅🚀: **owner signup → setup → AI menu
import → generate & publish storefront (platform subdomain) → QR/pickup/delivery
ordering → Stripe payment → order management (KDS + status) → own-driver
delivery → transactional email.** The only launch prerequisites are
**deployment config** (Railway/Vercel env incl. persistent object storage) —
see `docs/runbooks/first-customer-launch.md` — not missing code.
