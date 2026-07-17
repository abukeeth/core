# Phase 3 — Database Audit

**Audit type:** Technical Due Diligence — Database & Schema Review
**Repository:** `abukeeth/core` (product: **OrderVora**)
**Date:** 2026-07-17
**Primary evidence:** `apps/api/prisma/schema.prisma` (2,100 lines), `apps/api/prisma/migrations/*` (16 migrations).
**Scope:** Database only — schema, models, enums, relationships, foreign keys, constraints, indexes, tenancy, migrations, data integrity, and long-term scalability. UI, frontend architecture, and backend architecture are **out of scope** this phase (backend tenancy *enforcement in code* was covered in Phase 2; here we assess only whether the **schema** enforces it). No schema changes, migrations, or fixes were made — audit only.

**Measured facts used throughout:**
- **~70 models, ~60 enums** in one PostgreSQL schema (single database, single Prisma datasource).
- **106 foreign keys**, of which **81 `ON DELETE RESTRICT`** and **25 `ON DELETE SET NULL`** — **zero `ON DELETE CASCADE`**.
- **16 migrations**, `20260703000542_init` (1,734 lines) + 15 incremental; all provider = `postgresql`.
- Primary keys are **UUID (`@default(uuid())`) on every model** — no integer surrogate keys except `Order.orderNumber` (a per-tenant sequence value, not a PK).

---

## Table of Contents
1. [Executive Summary](#1-executive-summary)
2. [Database Topology](#2-database-topology)
3. [Schema Domain Map](#3-schema-domain-map)
4. [Tenancy Analysis](#4-tenancy-analysis)
5. [Identity Analysis](#5-identity-analysis)
6. [Commerce Analysis](#6-commerce-analysis)
7. [Website Builder Analysis](#7-website-builder-analysis)
8. [AI & Import Analysis](#8-ai--import-analysis)
9. [Migration Analysis](#9-migration-analysis)
10. [Index & Query Analysis](#10-index--query-analysis)
11. [Data Integrity Risks](#11-data-integrity-risks)
12. [Top 10 Database Strengths](#12-top-10-database-strengths)
13. [Top 10 Database Risks](#13-top-10-database-risks)
14. [KEEP / EXTEND / REFACTOR / REPLACE Matrix](#14-keep--extend--refactor--replace-matrix)
15. [Unknown Areas Requiring Runtime Verification](#15-unknown-areas-requiring-runtime-verification)

---

## 1. Executive Summary

The OrderVora database is a **single-tenant-per-restaurant PostgreSQL schema** of unusually high craftsmanship for an MVP. Financial correctness is treated seriously: money is stored in integer cents throughout, order/payment records are **frozen snapshots** deliberately divergent from live menu data (`OrderItem` comment, schema:988-990), there is an **append-only transaction ledger** (`Transaction`, schema:1357), a **transactional outbox** (`OutboxEvent`, schema:1091), DB-backed **idempotency** (`IdempotencyKey`, schema:2036) and **webhook idempotency** (`WebhookEvent` unique on `[source, externalEventId]`, schema:2024). Enums are used pervasively and precisely; unique constraints correctly encode the domain's business rules (one review per order, one coupon code per restaurant, one payment per order, etc.).

The schema's **defining structural limitation** is its tenancy model: **the tenant is the `Restaurant`, and a `Restaurant` has exactly one owner** (`Restaurant.ownerId @unique`, schema:107). There is **no `Organization` model, no `Location` model, and no many-to-many user↔business membership**. Every one of the ~40 tenant-owned tables foreign-keys **directly to `restaurantId`**. This is clean and consistent for the current "one owner → one business → one storefront" product, but it **cannot represent** an Organization owning multiple Businesses, or a Business spanning multiple Locations, without a structural change touching most tables. The roadmap explicitly lists multi-location as a goal, so this is the single most consequential database finding.

Tenant isolation is **not enforced by the schema** — there is no row-level security, no composite tenant-scoped foreign keys, and several tenant-scoping columns are **denormalized scalars with no FK** (`OutboxEvent.restaurantId`, `Transaction.restaurantId`, `Fulfillment.restaurantId`, `NotificationLog.restaurantId`, `IdempotencyKey.restaurantId`). Isolation depends entirely on application `where` clauses (Phase 2 finding). The schema *enables* correct isolation via consistent `restaurantId` columns but does not *guarantee* it.

Migrations are **overwhelmingly additive and safe** — 15 of 16 add columns/tables/enums with defaults and required no data backfill; the two data-touching statements found are both safe (`UPDATE Restaurant SET setupStep='DONE'` marking existing rows complete; an `ISSUED→PENDING` enum-value remap done via Prisma's standard safe enum-swap). No `DROP TABLE`, `DROP COLUMN`, or column-narrowing was found in any migration.

Overall: a **KEEP / EXTEND** schema. The commerce, payments, website-builder, and job models are keepers. The tenancy layer needs an **EXTEND** (insert Organization/Location above Restaurant) rather than a replace, and there is a concrete, addressable list of **unindexed foreign-key columns** that will become query hotspots at scale.

---

## 2. Database Topology

| Property | Value | Evidence |
|---|---|---|
| Engine | PostgreSQL | `schema.prisma:6`, all migrations `provider = postgresql` |
| Databases | **One** logical database, one Prisma datasource | `schema.prisma:5-7` |
| ORM | Prisma 7 (`@prisma/client`, `@prisma/adapter-pg`) | Phase 1/2 |
| Provider coupling | None — `DATABASE_URL` only, no Postgres-vendor SDK | `PROJECT_MEMORY.md:36-39` |
| Model count | ~70 models | schema |
| Enum count | ~60 enums | schema |
| PK strategy | UUID v4 on every table (`@default(uuid())`) | throughout |
| Money | Integer cents (`*Cents Int`) everywhere; basis points for rates | `Order`, `DeliveryFeeRule.feeValue`, `Tax.rateBasisPoints` |
| FK count | 106 (81 RESTRICT, 25 SET NULL, 0 CASCADE) | migration grep |
| Migration tool | Prisma Migrate, 16 migrations | `migrations/` |

**Topology shape:** a **single-database, tenant-per-row** model. `Restaurant` is the hub; the vast majority of tables radiate from it via `restaurantId`. A second identity cluster (`Customer`/`GuestCustomer`) and a website cluster (`Site` and children) attach through `Restaurant`/`Site`. There is no sharding, no per-tenant schema/database separation, and no partitioning declared in the schema.

---

## 3. Schema Domain Map

The ~70 models group into nine domains:

1. **Identity & Auth (staff/owner):** `User`, `RefreshToken`, `PasswordResetToken`, `EmailVerificationToken`. Roles via `Role` enum (ADMIN/RESTAURANT_OWNER/RESTAURANT_STAFF).
2. **Tenant root:** `Restaurant` (+ `RestaurantHours`). Carries `businessType`, `setupStep`, suspension, referral, geocode.
3. **Catalog:** `MenuCategory`, `MenuItem`, `MenuItemVariant`, `ModifierGroup`, `ModifierOption`, `MenuItemModifierGroup`, `MenuItemInventory`.
4. **Customer identity:** `Customer`, `GuestCustomer`, `CustomerRefreshToken`, `CustomerPasswordResetToken`, `CustomerAddress`, `CustomerFavorite`, `CustomerPaymentMethod`.
5. **Cart & Orders:** `Cart`, `CartItem`, `Order`, `OrderItem`, `Review`, `OrderEvent`, `OutboxEvent`, `OrderTimeline`.
6. **Payments & money:** `PaymentProvider`, `PaymentMethod`, `PaymentAttempt`, `Payment`, `Refund`, `Transaction`, `Tip`, `Tax`, `Coupon`, `CouponRedemption`, `GiftCard`, `GiftCardTransaction`.
7. **Delivery & fulfillment:** `DeliveryConfig`, `DeliveryFeeRule`, `ServiceFeeRule`, `KitchenCapacity`, `Fulfillment`, `FulfillmentProvider`, `DriverAssignment`, `DriverLocationPing`, `DeliveryZone`, `DeliveryRule`, `Table`.
8. **Website builder:** `Site`, `SiteVersion`, `Theme`, `SiteScore`, `Domain`, `DomainEvent`, `SiteAsset`, `GenerationJob`, `ContactMessage`, `NewsletterSubscriber`.
9. **Platform ops:** `ImportJob`, `POSProvider`, `POSSyncLog`, `NotificationLog`, `WebhookEvent`, `IdempotencyKey`, `FraudSignal`, `AdminAuditLog`, `LoyaltyProgram`, `LoyaltyAccount`, `LoyaltyTransaction`.

**Observation:** the domain grouping is coherent and the schema is heavily commented with design rationale (e.g. schema:988-990, 1236-1240, 1443, 1900-1902) — the model is self-documenting to an unusual degree.

---

## 4. Tenancy Analysis

### 4.1 How isolation works today
The tenant boundary is **`Restaurant.id`**. Every tenant-owned table carries a `restaurantId` (directly or one hop away) and the application filters on it (Phase 2: 36/43 service files reference `restaurantId`). The schema supports this by making `restaurantId` a first-class, consistently-named column and adding composite indexes like `@@index([restaurantId, status])` on hot tables (`Order`, `Cart`, `PaymentProvider`, `Fulfillment`).

### 4.2 Is isolation enforced by application logic or by schema?
**By application logic only.** Evidence that the schema does *not* enforce it:
- **No row-level security.** Nothing in the schema or migrations declares Postgres RLS policies.
- **No tenant-scoped composite foreign keys.** FKs point at a child's own PK (e.g. `CartItem.cartId → Cart.id`), never at a `(restaurantId, id)` composite. A child row's tenant is only correct if the parent it points to was itself correctly scoped at write time.
- **Denormalized tenant scalars with no FK backstop:** `OutboxEvent.restaurantId` (schema:1094), `Transaction.restaurantId` (schema:1363), `Fulfillment.restaurantId` (schema:1618), `NotificationLog.restaurantId` (schema:1991, also nullable), and `IdempotencyKey.restaurantId` (schema:2039, nullable) are **plain `String` columns with no relation to `Restaurant`**. The database cannot verify these point at a real, correct tenant.

### 4.3 Is cross-tenant access possible?
**At the schema level, yes — nothing prevents it.** A query that omits the `restaurantId` predicate returns cross-tenant rows; a mis-set denormalized `restaurantId` scalar is undetectable by the DB. The only defense is correct application code. This is a *defense-in-depth gap*, not evidence of an actual leak — but the schema provides no second line.

### 4.4 Can it support Organization → Business → Location?

**Requested structure:**
```
Organization
 ├── Business A
 ├── Business B
 └── Business C

Business
 ├── Location A
 ├── Location B
 └── Location C
```

**Answer: No — not without a structural schema change.** Evidence:

1. **No `Organization` model exists.** There is no table above `Restaurant`.
2. **No `Location` model exists.** `Restaurant` *is* the location — it holds the single `address`, `lat`, `lng` (schema:120-127). There is no way to attach multiple addresses/storefronts to one business.
3. **One owner = one business is hard-enforced:** `Restaurant.ownerId @unique` (schema:107) plus `ownedRestaurant Restaurant? @relation("RestaurantOwner")` (a nullable *single* relation, schema:42). The service layer reinforces this (`createRestaurant` rejects a second — Phase 2, `restaurant.service.ts:47-51`). One `User` cannot own two `Restaurant` rows.
4. **One user belongs to at most one business:** `User.restaurantId String?` (schema:40) is a single nullable scalar — a **1:N** (restaurant→users) membership, **not M:N**. A user cannot be staff at two businesses, and there is no membership/join table to make them.
5. **~40 tables FK directly to `restaurantId`.** To introduce Organization/Location, every tenant-owned table's scoping column and the ~106 FK graph would need re-evaluation (does a `Coupon` belong to a Business or a Location? does an `Order` belong to a Location?).

**What *is* supported today:** exactly one level — `Owner (User) → Restaurant (Business == Location) → {catalog, orders, site, ...}`. The `businessType` enum (schema:234-244) lets that single business be a restaurant, coffee shop, retail store, etc., but there is still only **one** of them per owner, at **one** location.

**Path to support it (EXTEND, not REPLACE):** insert an `Organization` (owns many `Restaurant`), rename/relayer `Restaurant` toward `Business`, add a `Location` table (owning the address/hours/tables/kitchen-capacity that are physically per-site), and introduce a `Membership` join (`userId`, `organizationId`/`businessId`, `role`) to replace the single `User.restaurantId`. This is a large but well-understood migration; the current schema's consistency (one uniformly-named `restaurantId` everywhere) actually makes it *tractable*.

---

## 5. Identity Analysis

### 5.1 Two separate identity systems (correct)
Staff/owner (`User` + `Role`) and diners (`Customer`/`GuestCustomer`) are **deliberately separate auth tables** (schema:672-673: "diners and restaurant staff are different trust domains and never share an auth table"). Each has its own hashed, DB-tracked, revocable refresh tokens (`RefreshToken` vs `CustomerRefreshToken`) and single-use reset tokens. This is a strength.

### 5.2 Staff identity
- `User.role` is a single enum, not a membership-scoped role. There is no per-restaurant role — a `RESTAURANT_STAFF` user's scope is entirely determined by their single `restaurantId`.
- **Drivers reuse `User`** rather than a parallel model (`DriverAssignment.driverId → User`, schema:1656-1663) — a reasonable normalization.
- Staff deactivation is a boolean kill-switch (`User.isActive`, schema:29), enforced at login/refresh only (documented).

### 5.3 Customer identity
- `Customer.email @unique` (schema:677) is **global**, not per-restaurant — a diner has one platform-wide account usable across restaurants. This is coherent with `LoyaltyAccount`/`CustomerPaymentMethod` being explicitly scoped per-restaurant on top of a shared customer (schema:1923-1924, 783-785).
- `GuestCustomer` has **no unique constraint on email** (schema:731-741) — intentional (a new guest row per guest checkout), but means guest orders are not deduplicated into a customer identity.
- `CustomerFavorite` correctly uses `@@unique([customerId, menuItemId])` (schema:779).

### 5.4 Weakness
The **single-membership** model (`User.restaurantId`) is the identity-layer expression of the tenancy limitation in §4.4 — it blocks multi-business staff and org-level administrators.

---

## 6. Commerce Analysis

### 6.1 Products / Categories / Variants / Modifiers
- **Structure:** `MenuCategory 1─N MenuItem`; `MenuItem 1─N MenuItemVariant`; modifiers are a proper **M:N** via `MenuItemModifierGroup` join with `@@unique([menuItemId, modifierGroupId])` (schema:1802). `ModifierGroup` is restaurant-scoped and reusable (schema:1759). This is a correct, normalized catalog model.
- **Strength:** variants and modifiers are additive (`extends, does not fork, MenuItem`, schema:1735) — no catalog duplication.
- **Weakness:** `MenuItem.categoryId` is **required** (schema:207) — an item must belong to exactly one category; no uncategorized or multi-category items. Minor.
- **Missing relationship:** `MenuItemVariant` has no per-variant inventory (inventory is per `MenuItem` only, `MenuItemInventory.menuItemId @unique`, schema:1810) — variants can't be independently stocked/86'd.

### 6.2 Inventory
- `MenuItemInventory` is **opt-in** (`trackInventory` default false) with an independent `isTemporarilyOutOfStock` "86" flag (schema:1805-1815). Pragmatic for small restaurants.
- **Weakness/Scalability:** inventory is a single `quantityAvailable Int?` with no reservation/ledger model — concurrent checkouts decrementing stock rely entirely on application-level locking (Phase 2 noted concurrency tests exist for order numbers, but not visibly for stock). No `InventoryLedger`/reservation table.

### 6.3 Customers / Addresses
- `CustomerAddress` caches geocode (`lat/lng`) at save time (schema:754) — good (avoids re-geocoding per checkout). `isDefault` boolean with no partial-unique constraint enforcing a single default (application-managed).

### 6.4 Orders / Order Items
- **Excellent design.** `Order` is the durable financial record with a full money breakdown (subtotal/tax/tip/delivery/service/discount/total, all cents) and a rich status triplet (`OrderStatus` × `OrderPaymentStatus` × `OrderFulfillmentStatus`). `orderNumber` is **per-restaurant sequential** enforced by `@@unique([restaurantId, orderNumber])` (schema:981).
- `OrderItem` is a **frozen snapshot** (`nameSnapshot`, `unitPriceCents`, `modifiersSnapshot`, `lineTotalCents`, schema:991-1002) — financial records never recompute from live menu. This is the correct pattern and explicitly reasoned (schema:988-990).
- **Strong indexing:** `Order` carries five indexes including `[restaurantId, status]`, `[restaurantId, createdAt]`, `[restaurantId, source]` (schema:982-985) — dashboards and reporting are well-served.
- **Weakness:** `OrderItem.menuItemId` is a hard FK (`ON DELETE RESTRICT`) to `MenuItem` — because it's RESTRICT, a `MenuItem` that has ever been ordered **can never be deleted** (only soft-hidden via `isAvailable`). This is arguably correct for audit but means the catalog accumulates permanently.

### 6.5 Cart
- `Cart` supports customer *or* guest (`customerId?` + `guestSessionId?`), coupon and loyalty selections re-validated at quote/placement (schema:843-852), and `expiresAt` for TTL sweeping. `CartItem.unitPriceCents` is frozen at add-time (schema:875-878). Well-indexed (`[restaurantId, status]`, `customerId`, `guestSessionId`).
- **Weakness:** `Cart 1─1 Order` via `Order.cartId @unique` (schema:933) — a cart converts to exactly one order. Fine, but there's no partial index to quickly find/expire only `ACTIVE` carts beyond the composite `[restaurantId, status]`.

### 6.6 Payments
- **Sophisticated and correct.** `PaymentProvider` (per-restaurant BYOP, `@@unique([restaurantId, providerType])`, schema:1268) → `PaymentMethod` (per-method routing, `@@unique([restaurantId, methodType])`) → `PaymentAttempt` (one row per authorization try across providers) → `Payment` (settled aggregate, `orderId @unique`, `successfulAttemptId @unique`).
- Encrypted credentials at rest as opaque strings (`credentialsEncrypted`, `webhookSecretEncrypted`) — schema treats secrets correctly (encryption reviewed in security phase, not here).
- `implemented Boolean` on the provider row mirrors the code-level stub flag (Phase 2).
- **Strength:** the attempt/settlement split cleanly models multi-provider failover in data, not just code.

### 6.7 Refunds
- `Refund` FKs to `Payment` **and** denormalizes `orderId` (schema:1339-1342) with the explicit rationale that "financial audit records must remain reachable regardless of how intermediate join paths evolve." Indexed on both `paymentId` and `orderId`. Sound.
- Partial-refund accounting is tracked on `Payment` (`refundedAmountCents`, schema:1326) — correct.

### 6.8 Coupons / Loyalty
- `Coupon` is restaurant-scoped (`@@unique([restaurantId, code])`, schema:1422) with per-customer and global redemption caps (`maxRedemptions`, `maxRedemptionsPerCustomer`). `CouponRedemption.orderId @unique` enforces one redemption per order (schema:1430); supports customer *or* guest redeemer.
- **Loyalty** is explicitly schema-only/future-ready (schema:1900-1902): `LoyaltyAccount @@unique([customerId, restaurantId])` (schema:1938) correctly scopes points per-restaurant with a transaction ledger. Well-modeled for a feature not yet wired.
- **Weakness:** `Coupon` has no `@@unique` guaranteeing case-insensitive code uniqueness (Postgres is case-sensitive; `SAVE10` vs `save10` are distinct) — application must normalize.

### 6.9 Commerce scalability concerns
- **High-write append-only tables without partitioning:** `OrderEvent`, `OutboxEvent`, `Transaction`, `DriverLocationPing`, `NotificationLog`, `OrderTimeline` all grow unboundedly. None is partitioned (Postgres declarative partitioning isn't expressible in Prisma schema and none is declared). At scale these become the largest tables with no retention/rollup strategy (see §11.4).
- **`DriverLocationPing`** (append-only GPS pings, schema:1687) is the fastest-growing table by design and has only a composite btree index — a partitioning/TTL candidate.

---

## 7. Website Builder Analysis

### 7.1 Versioning model
- `Site 1─N SiteVersion`; `SiteVersion.versionNo Int` with `@@index([siteId, versionNo])` (schema:465). Status lifecycle via `SiteVersionStatus` (VARIATION/DRAFT/PUBLISHED/ARCHIVED). `Site.publishedVersionId` is a **plain scalar pointer** (not a relation) to avoid a circular `Site↔SiteVersion` FK (schema:413-415) — a reasonable, documented choice.

### 7.2 Are sites versioned correctly? — **Yes.**
Each generation/edit produces a `SiteVersion` row with a JSON `definition` (schema:445), a `versionNo`, and provenance (`createdById`, and separately `publishedById`/`publishedAt` for who clicked Publish, schema:452-458). Variations from one generation batch share `generationBatchId` (indexed, schema:466). The model cleanly separates "generated/edited" from "published."

### 7.3 Are published versions immutable? — **Structurally, effectively yes; not hard-enforced.**
- The **serving artifact** is immutable by design: Phase 2 established that `publishSite` renders each page once to `ReleaseStorage` keyed by `siteId/versionId/slug`, and production serves the static file. A published version's *rendered output* is frozen in object storage.
- The `SiteVersion.definition` JSON row itself, however, has **no DB-level immutability guard** (no trigger, no status-based write protection) — nothing in the schema prevents an `UPDATE` to a PUBLISHED version's `definition`. Immutability is a convention enforced by application flow (new edits create a fresh DRAFT copy), not by the database. This is acceptable but worth noting.

### 7.4 Are rollbacks possible? — **Yes, by pointer.**
Because `Site.publishedVersionId` is a mutable pointer and every prior `SiteVersion` (and its rendered release) is retained (never hard-deleted; `SiteVersionStatus.ARCHIVED` exists rather than deletion), rolling back is repointing `publishedVersionId` to an earlier version and re-activating its release. The data model supports rollback natively.

### 7.5 Templates
- `Theme` is a versioned catalog (`@@unique([key, version])`, schema:488) with JSON `tokens`/`variants`/`layouts`/`personalityVector`/`cuisineAffinities`. `Site.themeId`/`themeVersion` pin a site to a specific theme version (schema:411-412) — so a theme update doesn't retroactively mutate a published site. Correct versioning discipline.

### 7.6 Domains
- `Domain` (per-site, `hostname @unique` globally, schema:512) models verification (`DomainVerificationStatus` + `verificationToken`) and TLS lifecycle (`DomainTlsStatus` + `tlsExpiresAt`). `DomainEvent` is a durable, **denormalized** history (keeps `hostname`/`siteId` and nullable `domainId ON DELETE SET NULL`, schema:541-546) so history survives domain deletion. Thoughtful.

### 7.7 Weaknesses
- `Site.brandProfile`, `Site.settings`, `SiteVersion.definition`, `Theme.*` are all **untyped `Json`** — flexible but schema-opaque; correctness of their shape is entirely application-enforced (see §11.5).
- `contactMessages`/`newsletterSubscribers` attach to `Site`, not `Restaurant` — fine, but means these leads are siloed under the website entity rather than the business.

---

## 8. AI & Import Analysis

### 8.1 Import jobs
- `ImportJob` models source (`ImportSourceType`: PDF/IMAGE/CSV/WEBSITE/GOOGLE_MAPS/DOORDASH/UBER_EATS/GRUBHUB), status (`ImportStatus`: PENDING→PROCESSING→AWAITING_REVIEW→APPROVED/REJECTED/FAILED), the extracted payload (`extractedData Json?`), and **durability fields** `attempts`/`startedAt`/`heartbeatAt` (schema:293-300) with an index `@@index([status, heartbeatAt])` supporting the reaper's stale-job scan.
- **Future-proof for multiple providers? — Yes.** Adding an import source is one enum value + one adapter (Phase 2). The schema doesn't hard-code provider specifics; `extractedData`/`sourceUrl`/`sourceFilePath`/`sourceMimeType` are generic.

### 8.2 Generation (AI) jobs
- `GenerationJob` mirrors `ImportJob`'s durability pattern (schema:584-592) and adds **AI-cost telemetry**: `tokensUsed`, `costCents`, `timings Json` (schema:580-582), plus a `GenerationStage` enum (INGEST→…→FINALIZE) and `GenerationStatus`. `batchId` groups a generation run (indexed). Good observability substrate.
- **Future AI agents? — Partially.** The `GenerationJob`/`GenerationStage` model is specific to the **website generation pipeline** (its stages are BRAND_ANALYSIS/THEME_SELECTION/CONTENT_GENERATION/ASSEMBLY/ASSETS/SCORING). A *general* AI-agent/task substrate (e.g. the roadmap's "AI Marketing Assistant," "AI Analytics Assistant") would not fit `GenerationJob`'s website-specific stage enum without either overloading it or adding a new generic job table. There is no generic `AIJob`/`AgentRun` model.

### 8.3 Status & retry tracking
- Both job tables track `attempts` (incremented per claim), `startedAt`, `heartbeatAt` — a real, reaper-backed retry/recovery model (Phase 2). `errorMessage`/`error` capture failures. This is a genuine durability design, not a status flag.
- **Weakness:** neither job table records a `maxAttempts` cap or a dead-letter status — a permanently-failing job is retried per the reaper's policy (in code) with no schema-level terminal "gave up after N" state distinct from `FAILED`.

### 8.4 AI data models
- There is **no dedicated AI/embeddings/vector model** (no `pgvector` usage in schema). AI is a *processing* concern (jobs) not a *storage* concern here — extracted results land in domain tables (`MenuItem`, `Site` definition JSON). Appropriate for current features; a future RAG/semantic-search feature would need new storage.

---

## 9. Migration Analysis

### 9.1 Additive vs destructive
**15 of 16 migrations are purely additive** (ADD COLUMN with defaults, CREATE TABLE, ADD CONSTRAINT/FK, ADD enum value). Measured: no `DROP TABLE`, no `DROP COLUMN`, no column type-narrowing, no `SET NOT NULL` on a backfilled-nullable column found anywhere.

Two migrations touch data, both safely:
1. `20260709221300_sprint18_business_setup_wizard`: `UPDATE "Restaurant" SET "setupStep" = 'DONE'` — backfills existing restaurants to "setup complete" so pre-wizard tenants don't get forced back into onboarding. Safe, idempotent-in-effect, no data loss.
2. `20260711013000_sprint20a_domain_engine`: a **Postgres enum swap** for `DomainTlsStatus` (create `_new` type, remap `ISSUED→PENDING`, swap, drop `_old`) — this is Prisma's standard safe enum-alter dance, executed in the correct order with an explicit `UPDATE ... WHERE tlsStatus = 'ISSUED'` before the type swap. Safe.

### 9.2 Migration safety
- **New columns are consistently `NOT NULL DEFAULT <x>` or nullable** — e.g. `User.isActive BOOLEAN NOT NULL DEFAULT true`, `Restaurant.businessType ... DEFAULT 'OTHER'`, job-durability fields all nullable/defaulted "so existing rows stay valid with zero backfill" (schema:296-297). This is textbook-safe additive migration practice.
- **FKs added post-hoc use `ON DELETE SET NULL` where the reference is optional** (referral, publishedBy, domainId) and `RESTRICT` where mandatory — internally consistent.

### 9.3 Rollback risks
- Prisma Migrate has **no down-migrations** (by design). Rollback = restore from backup or hand-write a reverse migration. The additive nature mitigates this: rolling *forward* is safe; rolling *back* a purely-additive migration is low-risk (drop the added column/table), but there is **no automated down path** in the repo.
- The **enum swap** (domain_engine) is the one migration whose rollback is non-trivial (would need to recreate the old enum and remap) — flagged as the single "handle with care" migration.

### 9.4 Production risks
- **`ALTER TYPE ... ADD VALUE` (CSV source, schema migration 2):** in Postgres versions before 12, `ADD VALUE` cannot run inside a transaction block, and even on 12+ a newly added enum value can't be used in the *same* transaction. Prisma handles this, but any future enum-add deployed alongside data using that value in one migration could fail — a known Postgres foot-gun to watch.
- **No `CONCURRENTLY` on index creation:** all `CREATE INDEX` in migrations are plain (blocking). On the `init` migration this is irrelevant (empty tables), but **future index additions on large tables** (e.g. backfilling the unindexed FKs in §10) would lock writes unless authored with `CREATE INDEX CONCURRENTLY` in a raw migration. None of the existing migrations demonstrate that pattern.
- **`migration_lock.toml`** pins the provider — consistent.

---

## 10. Index & Query Analysis

### 10.1 What's well-indexed (strength)
Hot read paths are deliberately indexed with **composite** indexes matching query shape:
- `Order`: `[restaurantId, status]`, `[restaurantId, createdAt]`, `[restaurantId, source]`, `customerId` (schema:982-985).
- `Cart`: `[restaurantId, status]`, `customerId`, `guestSessionId`.
- `PaymentProvider`: `[restaurantId, status]`; `Coupon`: `[restaurantId, isActive]`; `Transaction`: `[restaurantId, createdAt]`.
- Job reapers: `[status, heartbeatAt]` on `ImportJob` and `GenerationJob`.
- Outbox: `[processedAt, createdAt]` on `OutboxEvent` — exactly the "unprocessed, oldest first" scan shape.
- Append-only logs: `[orderId, createdAt]`, `[driverAssignmentId, recordedAt]`, etc.

This is above-average index hygiene for an MVP.

### 10.2 Unindexed foreign-key columns (concrete weakness)
**Postgres does not auto-index FK columns.** The following FK columns have **no covering index**, so parent-side deletes/`RESTRICT` checks and reverse lookups will sequential-scan the child at scale:

| Child table.column | FK → | Impact |
|---|---|---|
| `PaymentMethod.providerId` | PaymentProvider | reverse lookup unindexed |
| `PaymentAttempt.providerId` | PaymentProvider | (has `orderId` idx, not `providerId`) |
| `Payment.providerId` | PaymentProvider | Payment has **no** secondary index at all |
| `CustomerPaymentMethod.providerId` | PaymentProvider | only `customerId` indexed |
| `Refund.initiatedById` | User | unindexed |
| `Fulfillment.providerId` | FulfillmentProvider | only `[restaurantId,status]` indexed |
| `CartItem.menuItemId` / `variantId` | MenuItem / Variant | only `cartId` indexed |
| `OrderItem.menuItemId` | MenuItem | only `orderId` indexed |
| `GiftCardTransaction.orderId` | Order | only `giftCardId` indexed |
| `LoyaltyTransaction.orderId` | Order | only `[loyaltyAccountId,createdAt]` |
| `Cart.deliveryAddressId` / `tableId` | CustomerAddress / Table | unindexed |
| `NotificationLog.customerId` | (scalar) | unindexed |
| `FraudSignal.resolvedById` | User | unindexed |

These are latent — harmless at low volume, but each is a future slow query or a slow `RESTRICT` delete check. This is the most actionable, low-risk improvement list in the audit.

### 10.3 Denormalized-scalar tenant columns lack FK + sometimes index
`OutboxEvent.restaurantId`, `Fulfillment.restaurantId`, `Transaction.restaurantId` (indexed via composite), `NotificationLog.restaurantId` (indexed via composite), `IdempotencyKey.restaurantId` (unindexed) — no referential integrity to `Restaurant` (§4.2).

### 10.4 No full-text / trigram indexes
Menu search, customer lookup by name/email substring, etc. have no GIN/trigram indexes. Fine now; a search feature would need them.

---

## 11. Data Integrity Risks

1. **Tenant integrity is application-only (§4.2).** Denormalized `restaurantId` scalars with no FK can silently point at a wrong/nonexistent tenant; no RLS backstop. **Highest integrity risk.**
2. **`RESTRICT`-everywhere blocks tenant/entity deletion (data-lifecycle risk).** With 81 `ON DELETE RESTRICT` FKs and 0 CASCADE, **deleting a `Restaurant` is effectively impossible** without manually deleting dozens of child rows in dependency order first. There is no soft-delete flag on most entities and no cascade. This protects against accidental data loss but means **there is no defined tenant-offboarding / GDPR-erasure path in the schema** — account deletion is unimplementable as a simple `DELETE`.
3. **Cross-table money consistency is not DB-enforced.** `Order.totalCents` vs the sum of `OrderItem.lineTotalCents` + fees, and `Payment.capturedAmountCents`/`refundedAmountCents` vs `Refund` rows, are maintained by application logic; no CHECK constraints or triggers enforce that the ledger balances. `Transaction` is append-only but its sum is not reconciled against `Payment` at the DB level.
4. **Unbounded append-only growth with no retention (§6.9).** `OrderEvent`, `OutboxEvent`, `DriverLocationPing`, `NotificationLog`, `OrderTimeline`, `Transaction` have no partitioning, TTL, archival, or pruning strategy in the schema. `OutboxEvent` processed rows and `DriverLocationPing` are the fastest growers. No `Data Retention Strategy` is expressed anywhere in the schema or migrations.
5. **JSON columns are schema-opaque.** `SiteVersion.definition`, `Site.brandProfile`/`settings`, `Theme.*`, `Cart/OrderItem.modifiersSnapshot`, `*.payload`, `FraudSignal.details`, `DeliveryZone.geometry` are untyped `Json`. Malformed shape is undetectable by the DB; correctness rests entirely on application validation (Zod) at write time.
6. **No CHECK constraints anywhere.** Ranges that are business-invariants — `Review.rating` (1–5?), `RestaurantHours.opensAt/closesAt` (0–1439), non-negative `*Cents`, `pointsBalance >= 0` — are unconstrained at the DB level. All are application-guarded only.
7. **Boolean "isDefault" without single-default enforcement.** `CustomerAddress.isDefault`, `CustomerPaymentMethod.isDefault`, `PaymentProvider.isDefault`, `MenuItemVariant.isDefault` have no partial unique index guaranteeing exactly one default per parent — multiple defaults are representable.
8. **Case-sensitive uniqueness on user-facing codes.** `Coupon.code` (`@@unique([restaurantId, code])`) and `GiftCard.code @unique` are case-sensitive; `SAVE10`/`save10` coexist unless the app normalizes.
9. **`GuestCustomer` unbounded, un-deduplicated.** No unique email; every guest checkout can mint a row. Over time this table grows with low reuse and no linkage to a real `Customer` even when the same person later registers.
10. **Nullable tenant scope on `NotificationLog`/`IdempotencyKey`.** `restaurantId` nullable means some rows aren't tenant-attributable at all — acceptable by design but limits per-tenant auditing/pruning.

---

## 12. Top 10 Database Strengths

1. **Money is integer cents everywhere**, with basis points for rates (`Tax.rateBasisPoints`, `DeliveryFeeRule.feeValue`) — no floating-point currency anywhere.
2. **Frozen financial snapshots** (`OrderItem`, `CartItem.unitPriceCents`, `Order.*Cents`) correctly decouple the durable financial record from the live-rendering catalog (schema:988-990) — a mature, explicitly-reasoned pattern.
3. **Append-only ledger + audit trails**: `Transaction` (reconciliation backbone), `OrderEvent` (domain audit log), `AdminAuditLog` (platform actions) — the financial and administrative history is durable and append-only.
4. **Transactional outbox** (`OutboxEvent`) with the exact index for its scan (`[processedAt, createdAt]`) gives at-least-once eventing surviving crashes — rare maturity in an MVP.
5. **DB-backed idempotency**: `IdempotencyKey` (unique `key`) and `WebhookEvent` (unique `[source, externalEventId]`) enforce exactly-once semantics at the database, "a correctness requirement under multiple server instances" (schema:2034-2035).
6. **Business rules encoded as unique constraints**: one review per order, one coupon-redemption per order, one payment per order, per-restaurant order numbers, one loyalty account per customer-restaurant, one provider connection per type. The schema *is* the rulebook.
7. **Clean separation of trust domains**: staff `User` vs diner `Customer`, each with independent hashed/revocable token tables — no shared auth surface.
8. **Correct versioning of sites and themes**: `SiteVersion.versionNo`, pinned `Theme(key,version)`, retained history enabling native rollback; released output immutable in object storage.
9. **Real job-durability model**: `attempts`/`startedAt`/`heartbeatAt` + reaper indexes on both `ImportJob` and `GenerationJob`, plus AI cost telemetry (`tokensUsed`/`costCents`/`timings`).
10. **Consistent, self-documenting tenancy column** (`restaurantId` uniformly named across ~40 tables) with composite indexes on hot paths — which, paradoxically, is exactly what makes a future Organization/Location refactor *tractable*.

---

## 13. Top 10 Database Risks

1. **No Organization/Location layer; one-owner-one-business is hard-enforced** (`Restaurant.ownerId @unique`, `User.restaurantId` single scalar). The requested Organization→Business→Location hierarchy is **not supported** and requires a structural EXTEND touching ~40 tables (§4.4). *Highest-impact.*
2. **Tenant isolation is application-only** — no RLS, no tenant-scoped composite FKs, and 5 denormalized `restaurantId` scalars with no FK. One missing `where` or one mis-set scalar is a cross-tenant exposure with no DB backstop (§4.2, §11.1).
3. **No tenant-deletion / data-erasure path.** 81 `RESTRICT` FKs + 0 CASCADE + almost no soft-delete means deleting a Restaurant/Customer is not a simple operation — a GDPR/offboarding gap (§11.2).
4. **Unbounded append-only tables with no retention/partitioning** (`DriverLocationPing`, `OrderEvent`, `OutboxEvent`, `NotificationLog`, `Transaction`, `OrderTimeline`) — the future largest tables have no pruning, archival, or partition strategy (§6.9, §11.4).
5. **~13 unindexed foreign-key columns** (§10.2) — latent slow queries and slow `RESTRICT` delete-checks at scale; `Payment` has no secondary index at all.
6. **No CHECK constraints and no DB-level money reconciliation** — order totals, refund balances, ratings, and non-negativity are entirely application-guarded (§11.3, §11.6).
7. **Schema-opaque JSON columns** for site definitions, brand profiles, theme tokens, modifiers, geometry, and event payloads — shape correctness is invisible to the DB (§11.5).
8. **`GenerationJob` is website-specific**, so future non-website AI agents (marketing/analytics assistants) have no generic job/agent substrate without a new table (§8.2).
9. **`GuestCustomer` grows unbounded and un-deduplicated**, never linked to a `Customer` even when the same person registers later (§11.9).
10. **Migration operational sharp edges at scale**: no `CREATE INDEX CONCURRENTLY` pattern demonstrated (future index adds on large tables will lock), no down-migrations, and the one enum-swap migration is the only non-trivial rollback (§9.3-9.4).

---

## 14. KEEP / EXTEND / REFACTOR / REPLACE Matrix

| Database domain | Verdict | Justification (evidence) |
|---|---|---|
| **Identity & Auth (staff/customer split, token tables)** | **KEEP** | Correct trust-domain separation, hashed revocable tokens (schema:672-673, 697-728). |
| **Tenancy layer (Restaurant as tenant, `User.restaurantId`, `ownerId @unique`)** | **EXTEND** | Sound for single-business; must gain Organization + Location + Membership to meet the multi-location roadmap (§4.4). Extend above/around it — do not replace the consistent `restaurantId` spine that makes the extension feasible. |
| **Catalog (Menu/Variant/Modifier/Inventory)** | **KEEP / EXTEND** | Normalized and correct (schema:1735-1820); extend for per-variant inventory and multi/uncategorized items. |
| **Cart & Checkout** | **KEEP** | Frozen pricing, guest+customer, TTL, coupon/loyalty re-validation (schema:828-886). |
| **Orders & Order Items** | **KEEP** | Best-in-schema: snapshots, per-tenant order numbers, five targeted indexes (schema:923-1007). |
| **Payments / Attempts / Settlement** | **KEEP** | Mature multi-provider BYOP failover modeled in data (schema:1236-1333). |
| **Refunds / Transactions (ledger)** | **KEEP** | Denormalized-for-audit, append-only, correctly indexed (schema:1335-1372). |
| **Coupons / Gift Cards** | **KEEP / REFACTOR** | Keep structure; refactor for case-insensitive code uniqueness (§11.8). |
| **Loyalty** | **KEEP** | Well-modeled, future-ready, correctly per-restaurant scoped (schema:1900-1953). |
| **Delivery / Fulfillment / Drivers** | **KEEP / EXTEND** | Rich model (zones, rules, fallback, pings); `DriverLocationPing` needs a retention/partition plan (§6.9). Location-scoping revisits under §4.4. |
| **Website Builder (Site/Version/Theme/Domain)** | **KEEP** | Correct versioning, native rollback, immutable released output, pinned themes (§7). |
| **Import & Generation Jobs** | **KEEP / EXTEND** | Keep the durability model; extend with a **generic AI-job/agent table** for non-website AI features and a dead-letter/`maxAttempts` terminal state (§8.2-8.3). |
| **Ops (Outbox/Idempotency/Webhook/Fraud/Notification/Audit)** | **KEEP** | Genuinely mature reliability substrate (§12.4-12.5). Add retention for the append-only ones. |
| **Denormalized tenant scalars (`OutboxEvent`/`Transaction`/`Fulfillment`/`NotificationLog`/`IdempotencyKey`.restaurantId)** | **REFACTOR** | Add FK relations (and indexes) to `Restaurant`, or formalize as intentionally-detached with documented rationale (§4.2). |
| **Indexing (FK coverage, retention)** | **REFACTOR** | Add the ~13 missing FK indexes; introduce partitioning/TTL for append-only logs (§10.2, §11.4). |
| **Integrity guards (CHECK constraints, single-default, money reconciliation)** | **EXTEND** | Add DB-level CHECKs and partial-unique defaults as defense-in-depth (§11.3, §11.6-11.7). |
| Any domain | **REPLACE** | **None.** No domain is mismodeled badly enough to warrant a ground-up replacement. The heaviest change (tenancy) is an EXTEND, not a REPLACE, precisely because the existing model is internally consistent. |

---

## 15. Unknown Areas Requiring Runtime Verification

The following cannot be determined from schema + migrations alone and need a live database or runtime inspection:

1. **Actual row counts / table sizes** — which append-only tables are already large, and whether any partitioning was applied outside Prisma (raw SQL). The schema shows no partitioning; a DBA may have added it out-of-band.
2. **Whether Postgres RLS is enabled at the database level** independent of the schema. Prisma doesn't manage RLS; a Supabase/managed deployment *could* have policies the schema file wouldn't show. (Phase 1 noted the DB provider is unconfirmed.)
3. **Presence of database-level triggers, CHECK constraints, or generated columns** added by raw SQL outside Prisma migrations — the ORM schema wouldn't reflect them.
4. **Connection pooling / max connections** and whether the single-process worker model (Phase 2) plus Prisma pool sizing is appropriate for the deployment — a runtime/config concern.
5. **Real index usage and slow-query profile** (`pg_stat_user_indexes`, `pg_stat_statements`) — whether the unindexed FKs in §10.2 are actually hit, and whether any declared index is unused.
6. **Data-retention practice in operation** — whether any external job prunes `OutboxEvent`/`DriverLocationPing`/`NotificationLog`, since nothing in the schema does.
7. **Referential correctness of denormalized scalars in live data** — whether `OutboxEvent.restaurantId`, `Transaction.restaurantId`, etc. are in fact always consistent with their transitive parent (only measurable against real rows).
8. **Migration drift** — whether the deployed database schema matches `schema.prisma` exactly, or whether hotfixes were applied directly (checkable via `prisma migrate status` / `prisma db pull` against the live DB).
9. **Backup/PITR posture** — given the absence of down-migrations and `RESTRICT`-everywhere deletes, the real rollback strategy is backup-based; its RPO/RTO is an operational unknown (see `docs/runbooks/disaster-recovery.md`, not verified here).

---

*End of Phase 3 — Database Audit. Findings cover schema, relationships, constraints, indexes, tenancy, migrations, and integrity only. No schema changes, migrations, or fixes were made. Backend code enforcement of tenancy was assessed in Phase 2; database-level security (encryption, RLS, access control) is deferred to the security phase.*
