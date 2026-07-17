# OrderVora — Next 30 Days Execution Plan

**Companion to:** `PHASE_01`–`PHASE_03` audits and `ORDERVORA_FUTURE_ROADMAP.md`
**Date:** 2026-07-17
**Scope:** The **first 30 days only** — the tenancy foundation (Organization + Membership + tenant-resolution seam) and the independent database isolation quick-wins. This document lists the **top 20 engineering tasks**, dependency-ordered, each with Goal / Files affected / Database impact / Estimated effort / Acceptance criteria.

**Ground rules for this window (from the roadmap's Expand phase):**
- Every schema change is **additive** — new nullable/defaulted columns and tables only. **No `DROP`, no `NOT NULL` tightening, no rename** this window (those are the 60-day "Contract" step).
- All existing single-business behavior must keep working unchanged — new code paths run behind **dual-read**.
- Effort is in **engineer-days (ed)** for one mid/senior engineer. Tags: **S** ≤1ed, **M** 2–3ed, **L** 4–5ed.

**Two parallel tracks:**
- **Track A — Tenancy foundation** (Tasks 1–13): strictly dependency-ordered.
- **Track B — DB isolation quick-wins** (Tasks 14–18): independent of Track A, can start day 1 in parallel.
- **Track C — Verification & billing scaffold** (Tasks 19–20): closes the window.

---

## TRACK A — Tenancy Foundation

### Task 1 — Add `Organization`, `Membership`, `OrgRole` to the schema (Expand)
- **Goal:** Introduce the account layer above `Restaurant` as additive, nullable-safe tables. No behavior change yet.
- **Files affected:** `apps/api/prisma/schema.prisma` (new `Organization`, `Membership` models, `OrgRole` enum); new migration `apps/api/prisma/migrations/<ts>_org_membership_foundation/migration.sql`.
- **Database impact:** **Additive.** `CREATE TABLE "Organization"` (`id` uuid PK, `name`, `slug` unique, timestamps); `CREATE TABLE "Membership"` (`id`, `userId` FK→User, `organizationId` FK→Organization, `role` OrgRole, `@@unique([userId, organizationId])`, `@@index([organizationId])`); `CREATE TYPE "OrgRole"`. FKs `ON DELETE RESTRICT` (consistent with the schema's 81-RESTRICT convention). No writes to existing tables.
- **Estimated effort:** **S** (1ed).
- **Acceptance criteria:** `prisma migrate dev` applies cleanly; `prisma validate` passes; generated client exposes `organization`/`membership`; existing test suite (160 files) green with zero code changes; migration contains only `CREATE TABLE`/`CREATE TYPE` (no `ALTER ... DROP`).

### Task 2 — Add `Restaurant.organizationId` (nullable FK)
- **Goal:** Give every Business a pointer to its Organization, nullable during migration.
- **Files affected:** `apps/api/prisma/schema.prisma` (`Restaurant` model); migration `<ts>_restaurant_organization_link/migration.sql`.
- **Database impact:** **Additive.** `ALTER TABLE "Restaurant" ADD COLUMN "organizationId" TEXT` (nullable), FK→Organization `ON DELETE RESTRICT`, `CREATE INDEX "Restaurant_organizationId_idx"`. Nullable so existing rows stay valid with zero backfill (mirrors the repo's proven pattern, Phase 3 §9.2).
- **Estimated effort:** **S** (0.5ed).
- **Acceptance criteria:** Column exists and is nullable; index present; all existing `Restaurant` reads/writes unaffected; test suite green.
- **Depends on:** Task 1.

### Task 3 — Backfill script: one Organization + owner Membership per Restaurant
- **Goal:** Populate the new tables from existing data so every current business is wrapped in an Organization owned by its current owner.
- **Files affected:** new `apps/api/scripts/backfill-organizations.ts`; register in `apps/api/package.json` scripts (`"backfill:organizations"`), following existing backfill-script conventions (e.g. `backfill-published-restaurants.ts`).
- **Database impact:** **Data write, idempotent.** For each `Restaurant` lacking `organizationId`: create `Organization` (name = restaurant name, slug derived+unique), create `Membership(ownerId → OWNER)`, set `Restaurant.organizationId`. Idempotent (skip if `organizationId` already set) — safe to re-run, same discipline as the existing `setupStep='DONE'` backfill (Phase 3 §9.1).
- **Estimated effort:** **M** (2ed, incl. tests).
- **Acceptance criteria:** After run, `COUNT(Restaurant WHERE organizationId IS NULL) = 0`; exactly one `Organization` and one OWNER `Membership` per pre-existing restaurant; re-running produces zero new rows; script has a unit/integration test on a seeded DB.
- **Depends on:** Task 2.

### Task 4 — `scope` service: `getScopedBusinessIds` / `getOrganizationScope`
- **Goal:** One authoritative function that resolves a user's Organization + accessible Business IDs + role from `Membership` — the seam that replaces scattered `getOwnRestaurantId`.
- **Files affected:** new `apps/api/src/modules/restaurants/scope.service.ts`; unit test `scope.service.test.ts`. (Leaves existing `restaurant.service.ts:getOwnRestaurantId` in place for dual-read.)
- **Database impact:** **Read-only.** Queries `Membership` + `Restaurant`.
- **Estimated effort:** **M** (2ed).
- **Acceptance criteria:** `getScopedBusinessIds(userId)` returns the businesses reachable via Membership; returns the same single business today's `getOwnRestaurantId` returns for existing users (parity test); returns `[]`/null cleanly for users with no membership; covered by tests.
- **Depends on:** Task 3 (needs backfilled memberships to be meaningful).

### Task 5 — `resolveScope` request middleware + typed request context
- **Goal:** Attach `{ userId, organizationId, businessIds, orgRole }` to the request once, so controllers stop re-deriving scope ad hoc.
- **Files affected:** new `apps/api/src/middleware/resolve-scope.ts`; augment the `Express.Request` type (alongside `require-auth.ts`'s existing `req.user` global augmentation); wire after `requireAuth` where needed.
- **Database impact:** **Read-only** (calls Task 4 service; one cached query per request).
- **Estimated effort:** **M** (2ed).
- **Acceptance criteria:** Any route mounting the middleware exposes `req.scope`; adds ≤1 DB query/request; unauthenticated requests are unaffected (runs after `requireAuth`); does not change any response shape; unit-tested with mocked scope service.
- **Depends on:** Task 4.

### Task 6 — `requireOrgRole` authorization middleware
- **Goal:** Per-Organization role checks (`OWNER`/`ADMIN`/`MANAGER`/`STAFF`) to sit alongside the existing global `requireRole`.
- **Files affected:** new `apps/api/src/middleware/require-org-role.ts`; test file. (Existing `require-role.ts` untouched.)
- **Database impact:** **None** (reads `req.scope` from Task 5).
- **Estimated effort:** **S** (1ed).
- **Acceptance criteria:** `requireOrgRole('OWNER','ADMIN')` returns 403 when `req.scope.orgRole` not in the set, 401 when unauthenticated, `next()` otherwise; mirrors `require-role.ts` semantics; unit-tested.
- **Depends on:** Task 5.

### Task 7 — Refactor controllers to the scope seam (dual-read, non-breaking) — batch 1 of 2
- **Goal:** Move the first ~10 of the 20 controllers calling `getOwnRestaurantId` onto `req.scope`, without changing behavior for single-business users.
- **Files affected:** ~10 controllers under `apps/api/src/modules/commerce/*` (e.g. `orders`, `payments`, `coupons`, `pos`, `analytics`, `loyalty`, `fulfillment`, `tables`, `menu-commerce` helpers, `delivery-rules`) — the callers identified in Phase 2 §2.2.
- **Database impact:** **None** (query shape identical; scope resolves the same single business).
- **Estimated effort:** **M** (3ed).
- **Acceptance criteria:** Refactored controllers resolve the tenant from `req.scope` (falling back to `getOwnRestaurantId` if scope absent, preserving dual-read); all existing controller tests pass unchanged; no route/response contract changes; single-business users see identical behavior.
- **Depends on:** Task 5.

### Task 8 — Refactor controllers to the scope seam — batch 2 of 2
- **Goal:** Complete the migration for the remaining ~10 controllers.
- **Files affected:** the remaining controllers of the 20 (`restaurants`, `imports`, `sites`, `menu`, `admin/restaurants`, delivery sub-controllers, etc.).
- **Database impact:** **None.**
- **Estimated effort:** **M** (3ed).
- **Acceptance criteria:** All 20 original `getOwnRestaurantId` call-sites now route through the scope seam (verifiable by grep: no *new* direct `getOwnRestaurantId` calls in controllers except the fallback inside the seam); full suite green; behavior parity for existing users.
- **Depends on:** Task 7.

### Task 9 — Organization read/update service + minimal routes
- **Goal:** Basic Organization surface (get current org, rename) so the account entity is manageable.
- **Files affected:** new `apps/api/src/modules/organizations/` (`organization.service.ts`, `.controller.ts`, `.routes.ts`, `.validation.ts`, `.errors.ts` — following the repo's uniform module taxonomy, Phase 2 §2.3); mount in `apps/api/src/app.ts` (`/api/organizations`).
- **Database impact:** **Read/update** on `Organization` (no schema change).
- **Estimated effort:** **M** (2–3ed).
- **Acceptance criteria:** `GET /api/organizations/me` returns the caller's org; `PATCH` renames it (OWNER/ADMIN only via `requireOrgRole`); Zod-validated; new module has co-located tests; slug uniqueness enforced.
- **Depends on:** Task 6.

### Task 10 — Membership management service + routes (list / invite / role)
- **Goal:** Let an org OWNER/ADMIN list members and set roles — the multi-user-per-account capability the single `User.restaurantId` couldn't express (Phase 3 §5.4).
- **Files affected:** `apps/api/src/modules/organizations/membership.service.ts` + controller/routes/validation/errors; mount under `/api/organizations/members`.
- **Database impact:** **Read/write** on `Membership` (no schema change). Reuses existing staff-invite email flow where present.
- **Estimated effort:** **M** (3ed).
- **Acceptance criteria:** OWNER/ADMIN can list members, change a member's `OrgRole`, and remove a membership; `@@unique([userId, organizationId])` prevents duplicates; a user cannot demote the last OWNER; tests cover the last-owner guard.
- **Depends on:** Task 9.

### Task 11 — Registration/signup creates Organization + OWNER Membership
- **Goal:** New signups get the org-wrapped shape natively (not just backfilled legacy users).
- **Files affected:** `apps/api/src/modules/auth/auth.service.ts` (signup path) and/or `apps/api/src/modules/restaurants/restaurant.service.ts:createRestaurant`; relevant tests.
- **Database impact:** **Data write** — on signup, create `Organization` + `Membership(OWNER)` in the same transaction as `User`/`Restaurant` creation.
- **Estimated effort:** **M** (2ed).
- **Acceptance criteria:** A fresh signup ends with exactly one Organization, one OWNER Membership, one Restaurant with `organizationId` set — all in one transaction (no partial state on failure); existing `createRestaurant` "one business per owner" guard preserved for this window; integration test covers the full signup→org shape.
- **Depends on:** Task 4.

### Task 12 — Admin scope + audit-log alignment to Organization
- **Goal:** Ensure platform `ADMIN` routes and `AdminAuditLog` remain correct with the new hierarchy (admin operates across orgs).
- **Files affected:** `apps/api/src/modules/admin/*`, `apps/api/src/modules/restaurants/restaurant.controller.ts` (admin restaurant routes).
- **Database impact:** **None** (read paths; `AdminAuditLog.targetType/targetId` are already generic strings, Phase 3 §3).
- **Estimated effort:** **S** (1ed).
- **Acceptance criteria:** Platform `ADMIN` (global `Role.ADMIN`) bypasses org-scope restrictions as before; admin restaurant listing/suspension still works; audit entries record org context in `metadata` where relevant; no regression in admin tests.
- **Depends on:** Task 8.

### Task 13 — Scope-isolation integration tests
- **Goal:** Prove that with two Organizations present, users cannot read/write across the boundary through the new seam.
- **Files affected:** new `apps/api/src/modules/organizations/scope-isolation.integration.test.ts`; possibly extend `apps/api/prisma/seed-beta.ts` for a two-org fixture.
- **Database impact:** **Test-only** (seeded fixtures).
- **Estimated effort:** **M** (3ed).
- **Acceptance criteria:** Tests spin up two orgs each with a business + orders; assert org-A user gets 403/empty on org-B resources across the refactored controllers; assert single-business parity for legacy shape; run in CI.
- **Depends on:** Task 8.

---

## TRACK B — Database Isolation Quick-Wins (independent; start day 1)

### Task 14 — Add missing foreign-key indexes — payments cluster
- **Goal:** Index the unindexed FK columns in the payments domain (Phase 3 §10.2) to prevent slow reverse-lookups and RESTRICT-check scans.
- **Files affected:** `apps/api/prisma/schema.prisma` (`@@index` on `PaymentMethod.providerId`, `PaymentAttempt.providerId`, `Payment.providerId`, `CustomerPaymentMethod.providerId`); migration authored with **`CREATE INDEX CONCURRENTLY`** (raw SQL, Phase 3 §9.4).
- **Database impact:** **Additive, non-blocking** index creation on populated tables (concurrent). No data change.
- **Estimated effort:** **S** (1ed).
- **Acceptance criteria:** Four indexes exist; migration uses `CONCURRENTLY` (does not lock writes); `EXPLAIN` on a provider-reverse-lookup uses the index; test suite green.

### Task 15 — Add missing foreign-key indexes — orders/catalog/misc cluster
- **Goal:** Index the remaining unindexed FKs (Phase 3 §10.2): `OrderItem.menuItemId`, `CartItem.menuItemId`/`variantId`, `GiftCardTransaction.orderId`, `LoyaltyTransaction.orderId`, `Cart.deliveryAddressId`/`tableId`, `Refund.initiatedById`, `FraudSignal.resolvedById`, `NotificationLog.customerId`.
- **Files affected:** `apps/api/prisma/schema.prisma`; `CREATE INDEX CONCURRENTLY` migration.
- **Database impact:** **Additive, non-blocking** indexes. No data change.
- **Estimated effort:** **S** (1ed).
- **Acceptance criteria:** All listed indexes present; migration uses `CONCURRENTLY`; no regression; documented in the migration comment which query each serves.

### Task 16 — FK relations for denormalized tenant scalars
- **Goal:** Give the denormalized `restaurantId` scalars real referential integrity (Phase 3 §4.2, §11.1) — `OutboxEvent`, `Fulfillment`, `Transaction` (relation), `NotificationLog`, `IdempotencyKey`.
- **Files affected:** `apps/api/prisma/schema.prisma` (add `restaurant Restaurant? @relation(...)` + FK); migration adding FK constraints (`NOT VALID` then `VALIDATE CONSTRAINT` to avoid a long lock — raw SQL).
- **Database impact:** **Additive constraint.** Add FK (`ON DELETE RESTRICT`/`SET NULL` as appropriate for nullable ones); use `ADD CONSTRAINT ... NOT VALID` + separate `VALIDATE CONSTRAINT` to avoid blocking. Prerequisite check: confirm no orphan rows first.
- **Estimated effort:** **M** (2ed, incl. orphan-check script).
- **Acceptance criteria:** FK constraints exist and validate; an orphan-detection query returns zero before validation; writes to these tables still succeed; test suite green. *If orphans exist,* they are reported (not silently deleted) for a decision — audit-only deletion is out of scope.

### Task 17 — Add index on `IdempotencyKey.restaurantId` and verify hot-path coverage
- **Goal:** Close the one unindexed nullable tenant scalar that participates in idempotency lookups; sanity-check the top query paths have coverage.
- **Files affected:** `apps/api/prisma/schema.prisma`; `CONCURRENTLY` migration.
- **Database impact:** **Additive** index.
- **Estimated effort:** **S** (0.5ed).
- **Acceptance criteria:** Index present; `EXPLAIN` on idempotency lookups is index-backed; no regression.

### Task 18 — Migration operational guardrail: concurrent-index authoring pattern + `migrate status` check
- **Goal:** Establish the repeatable safe pattern for index/constraint migrations used in Tasks 14–17, and confirm deployed DB matches schema (Phase 3 §9.4, §15.8).
- **Files affected:** `docs/runbooks/migration-rollback.md` (or new `docs/runbooks/concurrent-migrations.md`); no code.
- **Database impact:** **None** (documentation + a verification run of `prisma migrate status`).
- **Estimated effort:** **S** (1ed).
- **Acceptance criteria:** Runbook documents the `CREATE INDEX CONCURRENTLY` / `ADD CONSTRAINT NOT VALID`+`VALIDATE` recipe and why plain Prisma index migrations are avoided on large tables; `prisma migrate status` confirms no drift on the target DB.

---

## TRACK C — Verification & Billing Scaffold (close-out)

### Task 19 — `Subscription` scaffold on Organization (shell only)
- **Goal:** Stand up the billing anchor on `Organization` so the priced tiers (Starter/Growth/Pro/Enterprise — Phase 1 §11, no billing exists today) have a home — **schema + read model only, no payment wiring this window**.
- **Files affected:** `apps/api/prisma/schema.prisma` (new `Subscription` model: `organizationId @unique` FK, `plan SubscriptionPlan`, `status`, `currentPeriodEnd`, timestamps; `SubscriptionPlan` enum); additive migration. Optional read-only `GET /api/organizations/subscription`.
- **Database impact:** **Additive.** `CREATE TABLE "Subscription"`, `CREATE TYPE "SubscriptionPlan"`. Every existing/backfilled org gets a default `FREE`/`STARTER` row via the Task 3 backfill extension (idempotent).
- **Estimated effort:** **M** (2ed).
- **Acceptance criteria:** Table exists; one subscription row per org after backfill; no Stripe/payment integration attempted (explicitly deferred); reading a subscription returns the plan; test suite green.
- **Depends on:** Task 1 (Organization exists); coordinate backfill with Task 3.

### Task 20 — 30-day exit verification & dual-read audit
- **Goal:** Confirm the window's exit criteria: org-wrapped everywhere, seam adopted, isolation tests green, zero destructive migrations, single-business parity intact.
- **Files affected:** CI config / a verification checklist doc `docs/audits/SPRINT_30D_VERIFICATION.md`; no product code.
- **Database impact:** **None** (verification queries only).
- **Estimated effort:** **S** (1ed).
- **Acceptance criteria:** (1) `SELECT COUNT(*) FROM "Restaurant" WHERE "organizationId" IS NULL = 0`; (2) every migration this window is additive (no `DROP`/`SET NOT NULL`/rename — grep-verified); (3) scope-isolation integration tests (Task 13) pass in CI; (4) all 20 legacy `getOwnRestaurantId` controller call-sites route through the seam; (5) full test suite (≥160 files) green; (6) a legacy single-business account exercises order→payment→site flows with identical behavior to pre-window. Sign-off recorded in the verification doc.
- **Depends on:** Tasks 8, 13, 16, 19.

---

## Dependency Graph (summary)

```
Track A (serial):  1 → 2 → 3 → 4 → 5 → 6 → 9 → 10
                                   4 → 11
                                   5 → 7 → 8 → 12
                                            8 → 13
Track B (parallel, from day 1):    14, 15, 17 (independent)
                                   16 (after orphan check) ; 18 (doc, anytime)
Track C:                           19 (after 1, coordinate w/ 3)
                                   20 (after 8, 13, 16, 19)  ← window exit gate
```

## Effort Roll-Up
- Track A: 1 S + … ≈ **23ed** (Tasks 1–13).
- Track B: ≈ **5.5ed** (Tasks 14–18, parallelizable).
- Track C: ≈ **3ed** (Tasks 19–20).
- **Total ≈ 31.5 engineer-days.** With Track B run in parallel by a second engineer, the **critical path is Track A (~23ed)** — achievable inside a 30-day window for 1.5–2 engineers.

## Exit Definition (what "done" means at day 30)
Every existing business now lives inside an Organization with a Membership-based role model, resolved through one middleware seam; new signups create that shape natively; two-org isolation is test-proven; the highest-value FK indexes and denormalized-scalar FKs are in place (non-blocking migrations); and a billing anchor exists on Organization — **all additive, all backward-compatible, single-business behavior unchanged.** The 60-day "Contract" tightening (NOT NULL, Location layer) begins only after this gate passes.

---

*Scope is limited to the first 30 days by request. No 60/90/180-day or future-architecture material is included here — see `ORDERVORA_FUTURE_ROADMAP.md` for the full arc.*
