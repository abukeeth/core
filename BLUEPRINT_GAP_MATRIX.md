# OrderVora — Blueprint Gap Matrix

> **Document type:** Phase 1, Deliverable 2.
> **Purpose:** For every major blueprint capability, state the requirement,
> the current repository reality (evidence-based), the gap, its risk, the
> dependency chain, and the recommended future phase.
> **Method:** Repository evidence only. Companion to
> `ORDERVORA_SOURCE_OF_TRUTH.md`.
> **Repository:** `abukeeth/core` @ `main` `f126fef`. **Date:** 2026-07-19.

**Risk levels:** 🔴 Critical (blocks launch / data-safety) · 🟠 High (blocks a
core promise) · 🟡 Medium (quality/scale) · 🟢 Low (polish/deferrable).

**Phase legend (blueprint §20):** P1 = MVP+ (restaurants/delis) · P2 = Growth
(delivery/marketing) · P3 = Horizontal (Clover, vape/retail, domains,
multi-location) · P4 = Enterprise (franchise, POS, API).

---

## A. Platform & Multi-Tenancy

### A1 — Database-enforced tenant isolation (RLS)
- **Blueprint requirement:** Single shared Postgres, `tenant_id` on every
  table, **mandatory RLS**; "security enforced in the database, not the code"
  (§6, §19). Automated cross-tenant read test must fail on every deploy (§18).
- **Current repo state:** Isolation is **application-layer** Prisma scoping by
  `restaurantId` (94 FK uses). **No RLS policies, no `tenant_id`** in
  `schema.prisma`/migrations. No cross-tenant test.
- **Gap:** The blueprint's central safety guarantee is absent; a single
  missing `where` clause = cross-tenant leak.
- **Risk:** 🔴 Critical.
- **Dependency chain:** Requires deciding substrate (Supabase RLS vs. Postgres
  session-var RLS) → schema `tenant_id`/policy pass → connection-layer tenant
  context → RLS penetration tests in CI. Blocks trustworthy scale-up.
- **Recommended phase:** **Foundation (Phase 1)** — decision + guardrails
  now; full RLS rollout early P1/P2.

### A2 — `tenant_id` generalization & tenant model shape
- **Blueprint requirement:** Generalized `tenants` + `locations` +
  `tenant_members(role)` (owner/manager/staff/kitchen).
- **Current repo state:** Tenant = `Restaurant` (`ownerId @unique`); members
  via `User.restaurantId` + 3-value `Role`. No `locations`, no
  `tenant_members` role join.
- **Gap:** Single-owner, single-location shape; "kitchen" is not a DB role.
- **Risk:** 🟠 High (blocks franchise/multi-location; couples isolation to one
  table).
- **Dependency chain:** Depends on A1 substrate decision; precedes
  multi-location (I1) and franchise (P4).
- **Recommended phase:** Decision in **Phase 1**; implement multi-location P3.

### A3 — Subdomains + custom domains per tenant
- **Blueprint requirement:** `slug.ordervora.com` auto + custom-domain mapping
  (Vercel Domains API).
- **Current repo state:** **Custom domains + TLS implemented**
  (`sites/domain.service.ts`, `ssl-issuance-scheduler.ts`, `Domain` model,
  `siteEdgeMiddleware`). Subdomain routing via site-edge middleware present.
- **Gap:** Minor — verify wildcard-subdomain provisioning end-to-end
  (`docs/runbooks/wildcard-subdomains.md` exists).
- **Risk:** 🟢 Low.
- **Dependency chain:** Independent; already usable.
- **Recommended phase:** P1 (verify), P3 (scale).

---

## B. Onboarding "Magic" (≤15 min)

### B1 — Menu-photo → structured catalog
- **Blueprint requirement:** Claude Vision reads photo → extracts
  items/prices/categories → sales descriptions → suggests modifiers; <90s;
  live progress; review-after-generate.
- **Current repo state:** **Real.** `imports/vision-extractor.ts` +
  `image.adapter.ts` produce structured JSON; import job durability;
  AWAITING_REVIEW flow; setup wizard menu-import step. (Provider defaults to
  OpenAI, not Claude.)
- **Gap:** Auto modifier-group suggestion and AI sales-copy enrichment are
  partial; provider is not Claude by default.
- **Risk:** 🟡 Medium.
- **Dependency chain:** Independent core; feeds Website Builder (D).
- **Recommended phase:** P1 (already the flagship; polish enrichment).

### B2 — Google Business Profile import
- **Blueprint requirement:** Import name/hours/location/photos/reviews →
  generate About + SEO from real reviews.
- **Current repo state:** **Partial/real** — `GOOGLE_MAPS` adapter + Places
  client (`imports/adapters/google-maps/`).
- **Gap:** Reviews→SEO-content generation path not confirmed; "About from
  reviews" not evidenced.
- **Risk:** 🟡 Medium.
- **Dependency chain:** Feeds Website Builder content.
- **Recommended phase:** P2 (blueprint places GBP in Growth).

### B3 — Clover import + continuous sync
- **Blueprint requirement:** OAuth → Catalog/inventory import → webhook sync.
- **Current repo state:** **Not started** for import (no Clover import
  adapter); Clover exists only as **stub** payment/POS provider.
- **Gap:** Entire Clover onboarding lane missing.
- **Risk:** 🟡 Medium (a P3 promise, not a launch blocker).
- **Dependency chain:** Depends on POS provider framework (H3).
- **Recommended phase:** **P3.**

### B4 — CSV / manual import
- **Blueprint requirement:** Templates + AI cleanup.
- **Current repo state:** **Real** CSV adapter + column mapper
  (`imports/adapters/spreadsheet/`); manual entry via dashboard.
- **Gap:** AI "messy data" cleanup depth unverified.
- **Risk:** 🟢 Low.
- **Recommended phase:** P1 (done), refine P2.

### B5 — Live "magic" progress + save-per-step + publish-with-one-item
- **Blueprint requirement:** Realtime step-by-step progress; autosave; publish
  with a single product.
- **Current repo state:** Setup wizard with resumable `SetupStep` +
  `OnboardingStatus` (autosave/resume across devices). Progress is
  **polled**, not Realtime.
- **Gap:** Not Realtime; "the magic screen" is refresh-based.
- **Risk:** 🟡 Medium (UX/perceived-magic).
- **Dependency chain:** Shares realtime substrate with F1.
- **Recommended phase:** P1 polish; Realtime in P2.

---

## C. Commerce & Ordering

### C1 — Storefront ordering (pickup, QR dine-in, guest, Apple/Google Pay)
- **Blueprint requirement:** Zero-friction, no-app, guest checkout, wallet
  pay, scheduled orders, reorder, QR-table awareness.
- **Current repo state:** **Largely complete** — cart, guest checkout, quote/
  tax engine, order state machine, QR ordering (tables+tokens), scheduled
  order fields. Wallet (Apple/Google Pay) presence via Stripe not confirmed in
  code.
- **Gap:** Verify Apple/Google Pay wallet buttons; reorder UX depth.
- **Risk:** 🟡 Medium.
- **Dependency chain:** Depends on payments (H1).
- **Recommended phase:** P1.

### C2 — Live order tracking + KDS
- **Blueprint requirement:** Supabase **Realtime** status bar (preparing →
  ready → on the way); KDS with **financial firewall** (kitchen never sees
  money) enforced by RLS.
- **Current repo state:** Order status + timeline exist; KDS page **polls**
  (`dashboard/kitchen/page.tsx`). Kitchen "no money" is a **UI/route** concern,
  not RLS-enforced.
- **Gap:** No Realtime; financial firewall not DB-enforced.
- **Risk:** 🟠 High (both a UX promise and the blueprint's showcase security
  example).
- **Dependency chain:** Realtime substrate (F1) + RLS (A1).
- **Recommended phase:** P2 (realtime), tied to A1.

### C3 — Loyalty, coupons, gift cards, reviews
- **Blueprint requirement:** Points/tiers, coupon rules, review requests.
- **Current repo state:** **Complete** — loyalty program/accounts/txns,
  coupons + redemptions, gift cards + txns, reviews.
- **Gap:** Automated review-request *timing* belongs to marketing automation
  (E), which is missing.
- **Risk:** 🟢 Low (data model), 🟠 High for the automation trigger (see E1).
- **Recommended phase:** P1 (models done); triggers P2.

---

## D. Website Builder & Brand

### D1 — AI full-site generation (structured JSON, SEO, multi-page)
- **Blueprint requirement:** Not drag-drop; content-as-components rendered via
  design system; auto SEO (Schema.org LocalBusiness/Menu/Product), sitemap.
- **Current repo state:** **Complete** — generation pipeline, ~40 renderer
  modules, JSON-LD, SEO head, sitemap, versioning, preview+approval, scoring.
- **Gap:** None structurally.
- **Risk:** 🟢 Low.
- **Recommended phase:** P1 (done).

### D2 — AI brand identity (palette/fonts/tone) + guided customization
- **Blueprint requirement:** AI proposes full identity; "change the vibe" → 4
  AI alternatives; curated controls; "rewrite fancier."
- **Current repo state:** **Partial** — brand-analysis + content-generator +
  Theme Engine V3 (business-type-aware) + customization studio.
- **Gap:** Multiple AI-generated identity *directions* on demand;
  rewrite-tone actions depth unverified.
- **Risk:** 🟡 Medium.
- **Recommended phase:** P2.

### D3 — AI image generation for missing product photos
- **Blueprint requirement:** Generate/improve missing product imagery.
- **Current repo state:** **Not started** — curated stock imagery + gradient
  fallback (PR #14 imagery layer), no generative images.
- **Gap:** No image generation.
- **Risk:** 🟢 Low (fallback is acceptable).
- **Recommended phase:** P3.

---

## E. Marketing Automation

### E1 — Prebuilt automations (winback/birthday/review/welcome/referral/loyalty)
- **Blueprint requirement:** One-click automations with triggers + actions
  (SMS/email + coupon).
- **Current repo state:** **Not started** — no `campaigns`/`automations`
  tables, no marketing routes, no marketing dashboard page.
- **Gap:** Entire marketing-automation engine absent.
- **Risk:** 🟠 High (a core Growth-phase value driver; "own your customers").
- **Dependency chain:** Requires SMS (H4) + marketing email (H5) + customer
  segmentation (E2) + scheduler.
- **Recommended phase:** **P2.**

### E2 — Customer CRM & segments
- **Blueprint requirement:** Customer list, profiles, segments (all/repeat/
  lapsed/high-spend).
- **Current repo state:** `Customer` model exists (orders/spend fields), but
  **no CRM dashboard page** and no segmentation engine.
- **Gap:** Owner-facing CRM + segmentation missing.
- **Risk:** 🟠 High (prerequisite for E1).
- **Recommended phase:** P2.

### E3 — TCPA / opt-in compliance
- **Blueprint requirement:** Explicit opt-in at capture, auto-STOP, consent
  ledger, TCPA-respecting — built-in, not owner's burden.
- **Current repo state:** **Not started** (no consent ledger).
- **Gap:** Legal-compliance layer absent; **must precede any SMS marketing.**
- **Risk:** 🔴 Critical *if SMS marketing ships without it* (legal exposure).
- **Dependency chain:** Gates E1 SMS actions.
- **Recommended phase:** P2, **before** E1 SMS.

---

## F. Realtime & Infrastructure

### F1 — Realtime substrate
- **Blueprint requirement:** Supabase Realtime for order tracking, KDS,
  onboarding progress.
- **Current repo state:** **Polling** everywhere (`setInterval`). No SSE/WS/
  Supabase Realtime.
- **Gap:** No push substrate.
- **Risk:** 🟠 High (UX + scale).
- **Dependency chain:** Underpins B5, C2.
- **Recommended phase:** P2 (choose SSE/WS if staying off Supabase).

### F2 — Scheduled jobs (cron)
- **Blueprint requirement:** `pg_cron`/QStash for automations + weekly AI
  analytics.
- **Current repo state:** **In-process schedulers** (outbox, stale-offer, SSL
  issuance, job reaper). Works, but not durable cron.
- **Gap:** No external durable scheduler; single-process assumption.
- **Risk:** 🟡 Medium (reliability at scale / multi-instance).
- **Dependency chain:** Underpins E1 automations + G2 proactive AI.
- **Recommended phase:** P2.

### F3 — Staging/Prod parity + RLS tests in CI
- **Blueprint requirement:** Separate Staging/Prod, automated RLS tests each
  deploy, PITR backups, weekly external export.
- **Current repo state:** Strong CI (Postgres, migrate deploy, lint/type/
  test/build). **No RLS tests** (no RLS); backup/PITR is Supabase-specific in
  blueprint but repo is on Render/Railway.
- **Gap:** RLS tests; documented staging env; backup strategy for chosen DB.
- **Risk:** 🟡 Medium.
- **Recommended phase:** P1–P2, coupled to A1.

---

## G. AI Intelligence

### G1 — AI provider = Claude, tenant-scoped via Edge Function
- **Blueprint requirement:** Claude API as core; every call through a
  `tenant_id`-scoped Edge Function; cost tracking per tenant/plan.
- **Current repo state:** Provider abstraction (OpenAI default, Anthropic,
  Gemini) **in-process**; no Edge boundary; no per-tenant AI cost tracking.
- **Gap:** Provider default + isolation boundary + cost quotas.
- **Risk:** 🟡 Medium (works; security/cost governance weaker than blueprint).
- **Dependency chain:** Isolation ties to A1; cost quotas tie to billing (J1).
- **Recommended phase:** P2.

### G2 — AI Business Consultant (reactive chat + proactive insights)
- **Blueprint requirement:** In-dashboard chat over tenant data via safe
  tools; scheduled `ai_insights` with **one-click execution**.
- **Current repo state:** **Not started** — no `ai_conversations`,
  `ai_insights`, no consultant page, no proactive cron.
- **Gap:** Entire Layer-3 AI product missing.
- **Risk:** 🟠 High (a headline differentiator; Pro-tier value).
- **Dependency chain:** Needs analytics (present), scheduler (F2), safe
  tenant-scoped query tools (A1/G1), action hooks into marketing (E).
- **Recommended phase:** P2 (v1), P3+ (full proactive).

---

## H. Integrations

### H1 — Stripe Connect (platform + margin)
- **Blueprint requirement:** Stripe **Connect** connected accounts; platform
  application-fee margin.
- **Current repo state:** Real Stripe intents/refunds but **BYOP** (merchant's
  own keys), **not Connect**; no platform application fee.
- **Gap:** Connect onboarding + application-fee margin (a revenue source).
- **Risk:** 🟠 High (business-model + PCI posture).
- **Dependency chain:** Ties to billing (J1) for full monetization.
- **Recommended phase:** P1–P2.

### H2 — Delivery: Uber Direct + DoorDash Drive (day one, fallback)
- **Blueprint requirement:** Both providers live from Growth start, auto
  fallback, live driver tracking via webhooks→Realtime.
- **Current repo state:** **Stubs** (throw `NotImplemented`). Rules/quote
  framework + provider registry exist.
- **Gap:** Real provider integrations + webhook→tracking.
- **Risk:** 🟠 High (delivery is the P2 headline; storefronts can't fulfill
  delivery today).
- **Dependency chain:** Needs Realtime (F1) for driver tracking.
- **Recommended phase:** **P2.**

### H3 — POS (Clover/Square/Toast/Lightspeed)
- **Blueprint requirement:** Clover import/sync (P3); POS later.
- **Current repo state:** All POS providers **stub**.
- **Gap:** Real POS integrations.
- **Risk:** 🟡 Medium.
- **Recommended phase:** P3–P4.

### H4 — SMS (Twilio) + TCPA
- **Blueprint requirement:** Twilio SMS; transactional + marketing;
  TCPA-compliant.
- **Current repo state:** SMS provider **stub** (`implemented=false`).
- **Gap:** Real SMS + compliance (E3).
- **Risk:** 🟠 High (order SMS + marketing both blocked).
- **Recommended phase:** P2.

### H5 — Email (Resend) marketing
- **Blueprint requirement:** Resend; transactional + marketing.
- **Current repo state:** **SMTP/nodemailer, transactional only**
  (`email.provider.ts`). No marketing email, not Resend.
- **Gap:** Marketing email + template system (vendor choice open).
- **Risk:** 🟡 Medium.
- **Recommended phase:** P2.

### H6 — Object storage
- **Blueprint requirement:** Supabase Storage + Vercel Image Opt.
- **Current repo state:** **S3-compatible** client + local fallback.
- **Gap:** Vendor differs (functionally equivalent).
- **Risk:** 🟢 Low.
- **Recommended phase:** N/A (accept divergence).

---

## I. Data Model Extensions

### I1 — Multi-location
- **Blueprint requirement:** `locations(tenant_id, …)`; per-location
  inventory/hours.
- **Current repo state:** **Not started** — single `lat/lng/address` on
  `Restaurant`; inventory is per menu-item, not per-location.
- **Gap:** No location dimension.
- **Risk:** 🟡 Medium (P3/Enterprise blocker).
- **Dependency chain:** Depends on A2 tenant reshape.
- **Recommended phase:** P3.

### I2 — Bilingual (EN/AR) + RTL
- **Blueprint requirement:** `name`/`name_ar` on catalog **from day one**;
  full RTL in every screen; AR/EN content generation.
- **Current repo state:** **Not started** — no `name_ar` columns, no i18n
  framework, no RTL, no AR generation.
- **Gap:** Entire bilingual layer (a stated *unfair advantage*).
- **Risk:** 🟠 High for the target go-to-market (Arabic/Yemeni community); 🟡
  for general U.S. launch.
- **Dependency chain:** Schema columns → i18n framework → RTL styling → AR AI
  generation. Cheaper to add columns early than to backfill later.
- **Recommended phase:** **Decide in Phase 1**; schema+i18n P2, AR generation
  P2–P3.

### I3 — pgvector / embeddings / semantic search
- **Blueprint requirement:** `embedding vector` on products for smart search +
  AI recommendations.
- **Current repo state:** **Not started.**
- **Gap:** No vector search.
- **Risk:** 🟢 Low (advanced feature).
- **Recommended phase:** P3+.

---

## J. Monetization & Admin

### J1 — Billing / subscriptions (Starter/Growth/Pro/Enterprise)
- **Blueprint requirement:** Recurring SaaS subscription (primary revenue),
  Stripe Billing, plan gating, trials, annual discount, per-plan AI/SMS
  quotas.
- **Current repo state:** **Not started** — no subscription/plan tables, no
  Stripe Billing; referral rewards explicitly inert ("no billing system
  exists yet," `schema.prisma:138`).
- **Gap:** The **entire revenue mechanism** is unbuilt.
- **Risk:** 🔴 Critical (cannot monetize pilots; blocks the business model).
- **Dependency chain:** Independent to start; plan-gating later wires into AI
  quotas (G1) and feature flags across modules.
- **Recommended phase:** **First milestone after Phase 1** (see
  `MASTER_EXECUTION_SEQUENCE.md`).

### J2 — Super Admin (tenants, subscriptions, health, AI cost, support)
- **Blueprint requirement:** Full platform admin.
- **Current repo state:** **Partial** — admin restaurant management + suspend
  + audit log. No subscription/health/AI-cost/support surfaces.
- **Gap:** Billing-ops, system-health, AI-cost dashboards.
- **Risk:** 🟡 Medium.
- **Dependency chain:** Depends on J1 (subscriptions) + G1 (AI cost tracking).
- **Recommended phase:** P2–P3.

### J3 — MFA + audit for admin
- **Blueprint requirement:** MFA on admin accounts; audit logs (present).
- **Current repo state:** Audit log **present**; **MFA not started**.
- **Gap:** MFA.
- **Risk:** 🟠 High (admin controls all tenants).
- **Recommended phase:** P1–P2.

---

## Gap Summary by Risk

| Risk | Gaps |
|---|---|
| 🔴 Critical | A1 (RLS), J1 (Billing), E3 (TCPA — if SMS marketing ships) |
| 🟠 High | A2, C2, E1, E2, F1, G2, H1, H2, H4, I2 (for target GTM), J3 |
| 🟡 Medium | B1, B2, B5, C1, C3(triggers), D2, F2, F3, G1, H3, I1, J2 |
| 🟢 Low | A3, B4, C3(models), D1, D3, H5, H6, I3 |

*See `PHASE_1_FOUNDATION_COMPLETION_PLAN.md` for how the Phase-1 foundation
neutralizes the critical/high items, and `MASTER_EXECUTION_SEQUENCE.md` for
full ordering.*
