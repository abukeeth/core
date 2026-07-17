# Phase 1 — Repository Discovery

**Audit type:** Technical Due Diligence — Discovery Only
**Repository:** `abukeeth/core` (product name: **OrderVora**; internal package `ordervora-mvp`)
**Date:** 2026-07-17
**Scope of this document:** Discovery and documentation only. No evaluation, scoring, criticism, or recommendations are made here. Where a fact could not be confirmed from the code, it is listed in Section 12 (Unknown Areas) rather than assumed.

---

## 1. Executive Summary

OrderVora is a **multi-business commerce and operations platform** delivered as a monorepo containing two deployable applications: a **Node.js/Express + Prisma REST API** (`apps/api`) and a **Next.js/React web frontend** (`apps/web`). The product positions itself (per its own memory files) as an **"AI-powered restaurant operating system and direct ordering platform"** whose goal is to help food/retail businesses own their direct ordering channel rather than depend on high-commission delivery marketplaces.

The system spans a broad surface area for a single platform, including:

- A **customer-facing storefront and ordering flow** (menu browsing, cart, checkout, order tracking, QR/table ordering, customer accounts).
- A **business-owner dashboard** ("Business Control Center") covering orders, menu management, payments, delivery, loyalty, coupons, referrals, staff, analytics, POS, kitchen display, and a website builder.
- An **AI subsystem** used for menu import (vision extraction from PDFs/images/websites), brand analysis, website content generation, and brand-consistency scoring, behind a provider-agnostic abstraction (OpenAI / Anthropic / Gemini).
- A **website generation & publishing engine** that produces and hosts published restaurant sites, including a custom-domain and TLS/SSL issuance subsystem.
- A **platform-admin layer** (restaurant management, audit logs).

The codebase shows evidence of a long, sprint-driven development history (migrations and reports referencing Sprints 07 through 20A) and a strong emphasis on production hardening (idempotency, rate limiting, outbox eventing, job durability, worker health, metrics, readiness probes).

The remainder of this document inventories what exists, without judgment.

---

## 2. What This System Appears To Be

Based on code, schema, routing, and documentation, OrderVora appears to be:

- **A vertical SaaS platform for food-service and small retail businesses.** The supported `BusinessType` enum explicitly enumerates: `RESTAURANT`, `COFFEE_SHOP`, `DELI`, `VAPE_SHOP`, `CONVENIENCE_STORE`, `BAKERY`, `PIZZA`, `RETAIL`, `OTHER`. Although branding centers on "restaurant," the data model is generalized to multiple business types.
- **A direct-ordering / commerce engine.** The bulk of the backend (`modules/commerce/*`) is a full ordering, checkout, payments, fulfillment, delivery, loyalty, and coupon system.
- **A website builder and host.** The `modules/sites/*` module and `apps/web/src/app/dashboard/website` + `dashboard/builder` routes constitute an AI-assisted website generation, customization, publishing, domain, and scoring product.
- **An AI-assisted onboarding tool.** The `modules/imports/*` module ingests existing menus from PDFs, images, spreadsheets, websites, and third-party marketplaces (DoorDash, Uber Eats, Grubhub, Google Maps) to bootstrap a business's catalog.

In short: a combined **storefront + ordering engine + owner operations dashboard + AI website builder**, targeting independent food/retail operators.

---

## 3. Architecture Overview

### 3.1 High-level shape

A **pnpm monorepo** (`pnpm-workspace.yaml` → `apps/*`, `packages/*`; no `packages/*` currently present) with two applications:

| App | Stack | Role |
|-----|-------|------|
| `apps/api` | Node.js ≥20, Express 5, TypeScript, Prisma 7 (PostgreSQL), Zod | Backend REST API, background workers, AI, site rendering |
| `apps/web` | Next.js 16, React 19, TypeScript, Tailwind CSS 4 | Customer storefront + owner/admin dashboard |

### 3.2 Backend architecture (`apps/api`)

- **Entry / composition:** `src/index.ts` (process bootstrap), `src/app.ts` (Express app factory, middleware, route mounting).
- **Module pattern:** Each domain is organized as `controller` / `service` / `routes` / `validation` / `errors` files, with co-located `*.test.ts` (Vitest). This pattern is consistent across `auth`, `menu`, `restaurants`, `imports`, `sites`, `admin`, and every `commerce/*` submodule.
- **Provider registries:** Payments, POS, fulfillment, and notifications each use a **registry + provider interface** pattern allowing multiple external vendors behind one internal contract.
- **Cross-cutting middleware:** request correlation IDs (`X-Request-Id` propagated via `AsyncLocalStorage`), HTTP metrics (Prometheus via `prom-client`), Helmet CSP, CORS with apex/www normalization, cookie-based auth, per-provider webhook raw-body capture, rate limiting (Redis-backed store available), idempotency-key enforcement.
- **Operational endpoints:** `/health` (liveness + background worker health snapshot), `/ready` (DB connectivity readiness), `/metrics` (Prometheus scrape).
- **Background workers / schedulers (evidence in `lib` and `commerce/events`, `commerce/fulfillment`):** transactional **outbox worker/scheduler**, **stale-offer sweep scheduler**, **job durability** (claim/heartbeat/reaper for import & generation jobs), **SSL issuance scheduler** for site domains.
- **Data access:** Prisma ORM via `@prisma/adapter-pg` against PostgreSQL, configured through a single `DATABASE_URL` (provider-agnostic; no Supabase-specific SDK in use).

### 3.3 Frontend architecture (`apps/web`)

- **Next.js App Router** (`src/app`) with route groups for public marketing/landing (`page.tsx`), authentication (`login`, `register`, `forgot-password`, `reset-password`, `verify-email`), the **customer ordering flow** (`order/*`), the **owner/admin dashboard** (`dashboard/*`), and the **setup wizard** (`setup/*`).
- **API access layer:** multiple typed client wrappers in `src/lib` (`api.ts`, `server-api.ts`, `commerce-api.ts`, `owner-commerce-api.ts`, `staff-commerce-api.ts`, `site-editor.ts`, `kitchen-display.ts`), indicating separation between server-side and client-side, and between customer/owner/staff API surfaces.
- **Same-origin proxy:** `src/proxy.ts` + `next.config.ts` rewrites suggest the browser talks to the Next.js app, which server-side proxies `/api`, `/assets`, and `/preview` to `apps/api` (referenced in `app.ts` comments as the "same-origin asset-proxy architecture").
- **Design system:** a small shared UI kit in `src/components/ui` (button, card, badge, page-shell, page-header, empty-state, filter-pills, responsive-table, skeleton) plus shared `dashboard-nav` / `dashboard-drawer`. Tailwind CSS 4. Figma is cited as the design source of truth.

### 3.4 Data model scale

The Prisma schema (`apps/api/prisma/schema.prisma`, ~2,100 lines) defines on the order of **70+ models** and **60+ enums**, spanning identity, catalog, cart/order lifecycle, payments/refunds/transactions/tips/taxes, coupons/gift cards, loyalty, fulfillment/delivery/drivers/zones, POS sync, notifications, webhooks, idempotency, fraud signals, sites/domains/assets/generation jobs, and admin audit logs.

---

## 4. Repository Structure Overview

```
/ (repo root)
├── apps/
│   ├── api/                  # Express + Prisma backend
│   │   ├── prisma/           # schema.prisma, migrations/, seeds
│   │   ├── scripts/          # storage migration, backfills, seeders
│   │   └── src/
│   │       ├── app.ts, index.ts
│   │       ├── config/       # env loading + validation
│   │       ├── lib/          # ai/, storage, redis, jwt, metrics, jobs, logging…
│   │       ├── middleware/   # auth, roles, rate-limit, idempotency
│   │       ├── modules/      # auth, menu, restaurants, imports, sites, admin, commerce/*
│   │       └── types/
│   └── web/                  # Next.js frontend
│       └── src/
│           ├── app/          # App Router: order/, dashboard/, setup/, auth pages
│           ├── components/   # ui/ kit + dashboard nav
│           ├── lib/          # API client wrappers
│           └── proxy.ts
├── docs/
│   ├── audits/               # (this report)
│   ├── reports/              # Sprint07/08, ProductionHardening, deployment reports
│   ├── runbooks/             # ci-cd, database-setup, deployment, DR, env config, migrations
│   ├── PRODUCTION_SOURCE_OF_TRUTH.md
│   └── PRODUCT_IMPROVEMENT_LOG.md
├── load-tests/               # autocannon-based load testing
├── scripts/
├── CLAUDE.md                 # AI-agent working rules
├── PROJECT_MEMORY.md, ROADMAP.md, RELEASE_NOTES.md (~211 KB history)
├── SPRINT_01_REPORT.md, SPRINT_07_* (spec + final reports)
├── DEPLOYMENT_READINESS_REPORT.md, RAILWAY_DEPLOYMENT.md
├── docker-compose.yml, render.yaml, railway.json
├── package.json, pnpm-workspace.yaml, pnpm-lock.yaml, tsconfig.base.json
```

Notable: the workspace declares `packages/*` but no shared packages currently exist — the two apps do not appear to share code through a workspace package (each app has its own `lib`).

---

## 5. Major Applications

### 5.1 `apps/api` — Backend API & Workers
The system of record and business-logic tier. Serves:
- REST API under `/api/*` (owner, staff, customer, admin, public surfaces).
- Public ordering/menu endpoints under `/api/public/*`.
- Customer-account endpoints under `/api/customer/*`.
- Admin endpoints under `/api/admin/*`.
- Payment webhooks under `/api/webhooks/payments`.
- Published-site rendering: host-based edge middleware, `/store/<slug>` fallback, and `/preview/*`.
- Operational endpoints: `/health`, `/ready`, `/metrics`, `/assets/*`.
- Background schedulers/workers (outbox, stale-offer, job reaper, SSL issuance).

### 5.2 `apps/web` — Frontend Web Application
A single Next.js application serving three distinct experiences behind one deployment:
- **Public storefront / customer ordering** (`/`, `/order/*`, `/setup` public entry).
- **Business owner + staff dashboard** (`/dashboard/*`).
- **Authentication flows** (`/login`, `/register`, `/account/*`, password reset, email verification).

---

## 6. Major Modules

### 6.1 Backend modules (`apps/api/src/modules`)

| Module | Responsibility (as evidenced by files) |
|--------|----------------------------------------|
| `auth` | Staff/owner authentication: login, refresh tokens, password reset, email verification, cookies, JWT. |
| `restaurants` | Restaurant/business entity CRUD, referral codes, admin restaurant management. |
| `menu` | Owner menu management (categories, items). |
| `imports` | AI-assisted catalog import: adapters (CSV, PDF, image, spreadsheet, website, DoorDash, Uber Eats, Grubhub, Google Maps), vision extraction, job runner, data merge. |
| `sites` | Website builder engine: brand analysis, content generation, theme catalog/matching, assembly, rendering, SEO, scoring, domains + TLS/SSL, assets, contact/newsletter capture, preview tokens, publishing. |
| `admin` | Platform admin audit logging. |
| `commerce/*` | The commerce & fulfillment engine (see below). |

### 6.2 Commerce submodules (`apps/api/src/modules/commerce`)

| Submodule | Responsibility |
|-----------|----------------|
| `cart` | Guest + customer carts, cart identity/session. |
| `checkout` | Quote/tax computation, checkout orchestration. |
| `orders` | Order lifecycle, order-number generation, order state machine. |
| `payments` | BYOP (bring-your-own-provider) payments, orchestrator, provider registry, webhooks. |
| `menu-commerce` | Public menu, variants, modifiers, inventory. |
| `coupons` | Coupon/discount management. |
| `loyalty` | Loyalty programs, accounts, transactions (owner + customer surfaces). |
| `customers` | End-diner accounts: addresses, favorites, saved payment methods, order history. |
| `delivery-rules` | Delivery config, zones (geometry), fee/service-fee rules, hours, kitchen capacity, smart routing. |
| `fulfillment` | Fulfillment providers, driver assignment, stale-offer handling. |
| `qr-ordering` | QR/table ordering with signed QR tokens. |
| `reviews` | Customer reviews (public + customer surfaces). |
| `analytics` | Owner analytics. |
| `notifications` | Multi-channel notification dispatch (email/SMS/push). |
| `events` | Transactional outbox, event bus, order-event recording. |
| `pos` | POS integration/sync with external POS providers. |

### 6.3 Backend shared libraries (`apps/api/src/lib`)

AI abstraction (`ai/`), file/object storage (local + S3), release storage, image processing, color/culori utilities, encryption, JWT, password (argon2), Prisma client, Redis + Redis rate-limit store, idempotency, job durability + reaper, worker health, metrics, structured logging (pino), error tracking (Sentry), safe-fetch / safe-frontend-url guards, best-effort helpers.

### 6.4 Frontend modules (`apps/web/src`)
App Router route trees (`order`, `dashboard`, `setup`, auth), the `ui` component kit, dashboard navigation components, and typed API client wrappers split by audience (customer / owner / staff / server).

---

## 7. Major Features

Grouped by product area. This is an inventory of feature *presence*, not an assessment of completeness.

### 7.1 Customer / storefront
- Restaurant storefront & menu browsing (`/order/[restaurantId]`).
- Cart and checkout (`/order/[restaurantId]/cart`, `/checkout`).
- Order confirmation and live order tracking (`/order/confirmation/[orderId]`, `/order/track/[orderId]`).
- QR / table ordering (`/order/qr/[qrToken]`).
- Customer accounts: registration/login, saved addresses, favorites, saved payment methods, order history.
- Reviews.
- Loyalty (customer-facing).

### 7.2 Menu & catalog
- Menu categories and items, item images.
- Variants, modifier groups/options, inventory tracking.
- AI menu import from multiple sources with review/merge UX.

### 7.3 Ordering, payments & fulfillment
- Order lifecycle with an explicit state machine and event timeline/milestones.
- Order-number generation (concurrency-tested).
- Payments via pluggable providers (BYOP) with webhook signature verification.
- Refunds, transactions, tips, taxes, gift cards, coupons.
- Delivery configuration: zones (geometry-based), fee rules, service-fee rules, business hours, kitchen capacity, smart routing.
- Fulfillment with driver assignment, driver location pings, and courier providers.
- Fraud signals model.

### 7.4 Owner operations dashboard (`/dashboard/*`)
Pages present: overview, orders (+ detail), menu, payments, coupons, loyalty, referrals, analytics, staff, tables, delivery, driver, kitchen, kitchen-capacity, POS, restaurant, profile, import (+ detail), launch (+ test-order), website (editor/publish/messages/score/variations), builder.

### 7.5 Website builder & hosting
- AI "Website Studio" / builder flow and manual Website Hub.
- Brand analysis and AI brand concepts, theme catalog + matching, content generation, section rules, CTA/claims filtering, page assembly and rendering.
- SEO head generation, structured data.
- Site scoring ("Brand Consistency"/score service).
- Publishing engine with versioned site releases.
- Temporary domains + custom domains with verification and TLS/SSL issuance scheduling.
- Contact-form and newsletter capture on published sites.
- Preview tokens for unpublished previews.

### 7.6 Onboarding
- Multi-step **Business Setup Wizard** (`SetupStep` enum: business type → business info → location → payment provider → menu import → website theme → done).
- **Launch Center** and **Test Order Flow**.

### 7.7 Platform administration
- Admin restaurant management.
- Admin audit logs.
- (Subscription plans referenced in roadmap/pricing; see Section 12 for status uncertainty.)

### 7.8 Cross-cutting / platform
- Idempotency keys, rate limiting, transactional outbox, notifications (email/SMS/push), metrics, health/readiness, structured logging, error tracking, background job durability.

---

## 8. User Types

Authentication and roles indicate at least two separate identity systems.

### 8.1 Staff/platform identities (`Role` enum on `User`)
- **`ADMIN`** — platform administrator (manage restaurants, view audit logs, global scope).
- **`RESTAURANT_OWNER`** — business owner operating a restaurant/business via the dashboard.
- **`RESTAURANT_STAFF`** — staff member with a scoped operational role (staff management + `staff-commerce-api` client exist; kitchen/driver dashboard surfaces present).

Role enforcement is via `requireRole(...)` middleware.

### 8.2 Customer identities (separate from staff auth)
- **Registered customer / end-diner** (`Customer` model, own refresh tokens and password-reset tokens, `/api/customer/*`).
- **Guest customer** (`GuestCustomer` model, cookie/session-based cart identity, checkout without account).

### 8.3 Implied operational personas (surfaced in dashboard, not necessarily distinct auth roles)
- **Kitchen operator** (Kitchen Display / kitchen-capacity pages).
- **Driver / courier** (`driver` dashboard page, `DriverAssignment`, `DriverLocationPing`).

> Note: whether kitchen/driver are distinct roles or sub-views under `RESTAURANT_STAFF` is not fully determined from the enum alone (see Section 12).

---

## 9. Business Workflows

Inferred from routes, services, and state machines. Sequencing is descriptive, not verified end-to-end.

1. **Business onboarding / setup**
   Owner signs up → Setup Wizard (business type → info → location → payment provider connection → menu import → website theme) → Launch Center → Test Order → go live.

2. **AI menu import**
   Owner supplies a source (PDF, image, spreadsheet, website URL, or marketplace listing) → import job created → adapter + AI vision extraction → extracted data merged/reviewed → catalog populated.

3. **Website generation & publishing**
   Brand analysis → AI brand concepts/theme matching → content generation → assembly/render → preview (preview token) → publish (versioned release) → optional custom domain + TLS issuance → live site with contact/newsletter capture and scoring.

4. **Customer ordering (online)**
   Browse storefront/menu → add to cart (guest or customer) → checkout (quote, tax, fees, coupon/loyalty) → payment via connected provider → order created → order events/timeline → notifications → tracking.

5. **QR / table ordering**
   Scan table QR (signed token) → resolve table/restaurant → order flow tied to a table.

6. **Order fulfillment & delivery**
   Order enters state machine → delivery routing (zones/fees/hours/capacity) → fulfillment provider or local courier → driver assignment/offers (with stale-offer expiry) → driver location pings → completion.

7. **Owner operations**
   Manage orders, menu, coupons, loyalty, referrals, staff, tables, payments, analytics, POS sync, kitchen display/capacity via dashboard.

8. **Payments & settlement**
   Connect a payment provider (BYOP) → process payment attempts → webhooks reconcile status → refunds/tips/taxes/transactions recorded.

9. **Platform administration**
   Admin manages restaurants and reviews audit logs across the platform.

10. **Eventing / reliability**
    Domain events written to a transactional outbox → outbox worker dispatches (e.g., notifications) → idempotency and job-durability guards ensure at-least-once/reliable processing.

---

## 10. External Integrations

Evidenced by dependencies, provider directories, adapters, and env keys.

### 10.1 AI / LLM providers (pluggable, first-configured-wins)
- **OpenAI** (`openai`, `OPENAI_API_KEY`)
- **Anthropic** (`@anthropic-ai/sdk`, `ANTHROPIC_API_KEY`)
- **Google Gemini** (`@google/generative-ai`, `GEMINI_API_KEY`)
Selected via a single `getAIProvider()` abstraction; used for menu import vision extraction, brand analysis, content generation, and scoring.

### 10.2 Payment providers (BYOP registry)
`stripe`, `square`, `adyen`, `authorize-net`, `clover`, `fiserv`. (`stripe` SDK is a direct dependency; `@stripe/react-stripe-js` / `@stripe/stripe-js` on the frontend.)

### 10.3 POS providers
`toast`, `square-pos`, `clover-pos`, `lightspeed`, plus a `generic` provider. (POS sync models: `POSProvider`, `POSSyncLog`.)

### 10.4 Fulfillment / delivery providers
`doordash-drive`, `uber-direct`, `local-courier`.

### 10.5 Menu/catalog import sources
`csv`, `pdf`, `image`, `spreadsheet`, `website` (scraped via `cheerio`, PDF via `pdf-to-img`), `doordash`, `uber-eats`, `grubhub`, `google-maps` (`GOOGLE_MAPS_API_KEY`).

### 10.6 Notifications
Email (`nodemailer` / SMTP env vars), SMS, and push provider implementations (some may be stubs — see Section 12).

### 10.7 Storage
- Object storage via **AWS S3** (`@aws-sdk/client-s3`) with local-disk fallback; `OBJECT_STORAGE_*` env config and a `storage:migrate-to-s3` script.

### 10.8 Infrastructure / platform
- **PostgreSQL** via `DATABASE_URL` (provider-agnostic).
- **Redis** (`ioredis`) for rate limiting (and potentially other coordination).
- **Sentry** (`@sentry/node`) for error tracking.
- **Prometheus** (`prom-client`) for metrics.
- **Stripe** as a first-class payment integration.
- MCP servers configured in the environment (Figma, Supabase, Vercel, GitHub) — tooling/design integrations rather than runtime dependencies.

### 10.9 DNS / TLS
- Custom-domain verification + TLS/SSL issuance subsystem for published sites (`domain.service`, `ssl-issuance-scheduler`). External ACME/DNS provider details not confirmed from code inspected (see Section 12).

---

## 11. Product Vision (Inferred From Code)

Reading the code, schema, and in-repo memory/roadmap documents together, the inferred product vision is:

> **A single operating platform that lets independent food-service and small-retail businesses run their entire direct commercial presence — website, online ordering, payments, delivery, loyalty, and back-office operations — without ceding margin to third-party marketplaces, and with AI reducing the setup and content burden.**

Supporting signals:
- The stated purpose ("help restaurants own their ordering channel instead of depending on high-commission marketplaces") aligns with a full BYOP payments + own-website + own-ordering stack.
- Generalization beyond restaurants (coffee, deli, vape, convenience, bakery, pizza, retail) signals ambition toward a **horizontal multi-business SMB commerce OS**, with restaurants as the beachhead.
- Heavy investment in **AI onboarding** (import from anywhere) and **AI website generation** signals a "time-to-launch in minutes" positioning.
- The pricing tiers referenced in the roadmap (Starter $99, Growth $189, Pro $295, Enterprise custom) and admin/subscription references indicate a **subscription SaaS monetization** model.
- Extensive **production-hardening** work (idempotency, outbox, metrics, readiness, job durability, load tests) signals intent to operate this as a real multi-tenant production SaaS, not a prototype.
- Roadmap "Future Platform Expansion" (AI assistants, customer & owner mobile apps, deeper POS/delivery integrations, multi-location) signals a platform trajectory beyond the current web-first MVP.

---

## 12. Unknown Areas Requiring Further Investigation

The following are open questions surfaced during discovery. They are noted for later phases; no conclusions are drawn here.

1. **Provider completeness (stub vs. live).** Several provider directories include `stubs.test.ts`, and notifications/POS/fulfillment/payments providers may be partly stubbed. Which integrations are production-wired vs. placeholder needs verification.
2. **Subscription/billing status.** Pricing tiers and admin "subscription plans" appear in roadmap/memory, but a billing/subscription module was not clearly located in the backend module tree. Whether monetization is implemented, partial, or planned is unconfirmed.
3. **Staff role granularity.** The `Role` enum has only `ADMIN`, `RESTAURANT_OWNER`, `RESTAURANT_STAFF`. How kitchen and driver personas map to roles/permissions needs confirmation.
4. **Deployment target reality.** Multiple deployment configs coexist (`railway.json`, `render.yaml`, `docker-compose.yml`, `apps/web/vercel.json`) and the docs describe both Render and Vercel paths with caveats. The actual production topology (which app runs where, and whether Railway/Render/Vercel is authoritative) is ambiguous from config alone.
5. **Database provider.** `DATABASE_URL` is provider-agnostic; Supabase, Render Postgres, and Neon are all referenced in docs. The live provider is unconfirmed.
6. **Background worker execution model.** Schedulers/workers exist in-process (outbox, stale-offer, reaper, SSL). Whether they run in the same API process, a separate worker deployment, or both is not fully established.
7. **`packages/*` workspace.** Declared but empty; whether shared packages were removed or never created is unknown, and each app carries its own `lib`.
8. **Site edge routing / wildcard DNS.** Code comments reference `*.ordervora.com` wildcard DNS as "not yet active," with a `/store/<slug>` fallback. Current production hostname routing status needs confirmation.
9. **Custom-domain TLS issuer.** An `ssl-issuance-scheduler` exists; the concrete ACME/CA/DNS integration behind it was not identified in this pass.
10. **AI feature runtime behavior.** The AI abstraction is provider-agnostic and key-driven; whether all AI features are exercised in production, and with which provider, is unconfirmed.
11. **Two website flows.** `/dashboard/website/*` (manual Hub) and `/dashboard/builder/*` (AI Builder) coexist; the roadmap explicitly lists deciding whether to consolidate them as open. Their current relationship/authority is undetermined.
12. **Doc/code drift.** Memory files caution that `PROJECT_MEMORY.md`/`ROADMAP.md` may lag `RELEASE_NOTES.md` (~211 KB). The precise current sprint state and which dashboard pages have been rethemed vs. left on legacy styling should be reconciled against actual code in a later phase.
13. **Test/verification coverage reality.** Extensive `*.test.ts` files exist across the backend; actual pass state, coverage, and CI results were not executed in this discovery pass.

---

*End of Phase 1 — Repository Discovery. This document is descriptive only; evaluation, scoring, and recommendations are intentionally out of scope and deferred to later phases.*
