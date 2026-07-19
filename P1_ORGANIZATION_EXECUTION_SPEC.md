# OrderVora — P1 Organization Layer Execution Specification
## BOS Phase 1: introduce the Organization above the Business

> **Document type:** Executable specification for **BOS Phase 1 (Organization
> Layer)**. Governance-level; makes P1 ready to implement.
> **Scope:** **Documentation only.** No code, no `schema.prisma` changes, no
> migrations, no PR. This spec designs what P1 builds, how to prove it, and how
> to undo it. Actual schema/migration/code is authorized separately, PR by PR.
> **Prime directive:** **Additive evolution only.** Every step leaves the
> platform shippable and reversible. The existing `Restaurant`/`restaurantId`
> engine keeps working at all times.
> **Sources:** `BUSINESS_OS_FOUNDATION.md` (§2, §3, §7, §9),
> `BUSINESS_OS_IMPLEMENTATION_PLAN.md` (Phase P1),
> `MASTER_EXECUTION_SEQUENCE.md` (Part A / P1), `P0_EXECUTION_SPEC.md`.
> **Repository:** `abukeeth/core` @ `main` `cce65f8` (after PR #19 merged).
> **Date:** 2026-07-19.

---

## 1. Current state after P0 (verified on `main`)

P0 is complete and merged (PRs #18, #19). Verified facts P1 builds on:

- **Tenant Context seam exists and is wired.** `resolveTenantContext()`
  (`modules/tenancy/tenant-context.ts`) produces a `TenantContext`, and the
  flag-guarded `tenantContextMiddleware` (`app.ts`, after `cookieParser()`)
  attaches `req.tenant` when `TENANT_CONTEXT_ENABLED` is on.
- **`TenantContext` already reserves the Organization slot.** The interface has
  `organizationId: string | null`, and the resolver currently sets it to
  **`null`** (`tenant-context.ts:116`). **P1's job is to populate it** — the
  slot, the type, and the access pattern already exist, so no call site churn is
  needed.
- **First consumer proven.** `GET /api/restaurants/me` reads
  `req.tenant.businessId` (P0.3), demonstrating the seam end-to-end.
- **The tenant is still `Restaurant`.** `Restaurant.ownerId String @unique`
  (`schema.prisma:107`) enforces a strict **1:1 owner ↔ restaurant**. Members
  attach via `User.restaurantId` (`RestaurantMembers`) and the owner via
  `User.ownedRestaurant` (`RestaurantOwner`).
- **No Organization / Location / Membership / Capability entities exist.**
  `businessId` (== `restaurantId`) is the only scope key; isolation is
  app-layer.
- **Flag default:** `TENANT_CONTEXT_ENABLED` is **off** in production, so
  `req.tenant` is inert there until deliberately enabled.

**The load-bearing reinterpretation (unchanged):** `Restaurant` **is** a
Business; `restaurantId` **is** the Business scope key. P1 adds a layer
*above* it without renaming anything.

---

## 2. Organization architecture

### 2.1 What Organization is
The **Organization** is the **commercial/account root** — the entity that will
later hold **billing** (P6), a shared team (P2), and a portfolio of Businesses
(P8). In P1 it is deliberately **minimal**: it exists, it wraps exactly one
Business, and it records who owns it. Nothing hangs off it yet except the
Business link and an owner pointer.

### 2.2 What P1 does NOT put on Organization (guardrails)
- **No billing/subscription** (that is P6).
- **No `Membership`, no roles** (that is P2 — P1 uses a simple owner pointer,
  not a membership graph).
- **No multi-Business support in behavior** (that is P8 — P1 is strictly 1:1).
- **No Location** (that is P4).
- **No authorization role** — Organization is **not** an auth boundary in P1;
  `requireRole` + service scoping are unchanged. P1 is *structural only*.

### 2.3 The target shape (conceptual, no schema)
```
Organization (new)                 Business (= existing Restaurant)
  id                                 id                (unchanged)
  name           ──── wraps 1:1 ───▶ organizationId?   (NEW, nullable FK → Organization)
  ownerUserId    ─── points to ───▶  ownerId @unique   (unchanged; org.ownerUserId := restaurant.ownerId)
  createdAt/updatedAt                … all existing columns unchanged …
```

- **`Organization.ownerUserId`** is a plain pointer to the owning `User` — a
  minimal stand-in that mirrors `Restaurant.ownerId`. It is **not** a Membership
  and will be superseded by the P2 Membership model; keeping it minimal here
  avoids pre-empting P2.
- **`Business.organizationId`** is a **nullable** FK. Nullable is essential: the
  column can be added with zero backfill risk (existing rows stay valid), then
  populated by an idempotent data step.

### 2.4 Tenant Context population (the observable outcome of P1)
`resolveTenantContext()` gains one step: when it resolves `businessId`, it also
resolves that Business's `organizationId` and sets it on the context. This is
naturally flag-gated (the middleware only calls the resolver when the flag is
on), so:
- **Flag off:** `organizationId` stays `null` (exact P0 behavior).
- **Flag on:** `req.tenant.organizationId` is the Business's Organization (or
  `null` if a Business somehow has no org yet — tolerated, never thrown).

There is **no consumer** of `organizationId` in P1 (mirroring how P0.2 produced
`req.tenant` before P0.3 consumed it). Consumers arrive with billing (P6). P1's
deliverable is that the value is *present and correct*.

---

## 3. Business relationship model

| Relationship | P1 cardinality | Notes |
|---|---|---|
| Organization → Business | **1 : 1** (structurally 1 : N, behaviorally 1 : 1) | The schema models `Organization 1—N Business` so P8 needs no reshape, but P1 creates and enforces exactly one Business per Organization. |
| Business → Organization | **N : 1** (here always exactly 1) | `Business.organizationId` nullable during transition, populated 1:1 by backfill. |
| Organization → owning User | **N : 1** | `Organization.ownerUserId` = the Business's `ownerId`. |
| Business → owner User | unchanged | `Restaurant.ownerId @unique` stays exactly as-is. |

**Invariant P1 establishes and maintains:** *every Business has exactly one
Organization, and that Organization has exactly one Business, owned by the same
User.* This is the trivial (1:1:1) base case the whole BOS spine generalizes
from later — introduced now while it is cheap.

**Explicitly deferred:** many Businesses per Organization (portfolio) is **P8**;
P1 must not create or allow a second Business under an Organization.

---

## 4. Ownership model

### 4.1 P1 ownership (minimal, additive)
- The **existing owner is unchanged**: `Restaurant.ownerId @unique` remains the
  source of truth for "who owns this Business."
- The **Organization records the same owner** via `ownerUserId` (set equal to
  `restaurant.ownerId` at creation/backfill). This gives the Organization an
  owner without introducing the Membership model.
- **No co-owners, no roles, no scoped grants** — those are P2 (Membership).

### 4.2 Why not use Membership now
Introducing Membership here would couple two phases and enlarge blast radius.
P1 keeps ownership as a **single pointer** so that P2 can later introduce
`Membership` as the authoritative access model and, at that point, derive the
first `Owner @ Organization` membership from `Organization.ownerUserId` — a
clean, additive hand-off. P1 deliberately leaves `ownerId @unique` in place;
relaxing it (for multi-Business/co-owners) is **P8**, not P1.

### 4.3 Authorization impact in P1
**None.** Authorization remains `requireAuth` + `requireRole` + service-level
`restaurantId` scoping. `req.tenant.organizationId` is *descriptive*; it grants
and denies nothing in P1. No endpoint changes who can access what.

---

## 5. Migration strategy (additive, non-destructive)

Ordered so each step is independently shippable and reversible. **This is the
first schema change of the BOS arc**, so the CI migration-check will (correctly)
require a migration file to accompany the schema change — expected and allowed
in implementation (not in this spec).

1. **Additive schema (new table + nullable column).** Introduce the
   `Organization` entity and add `Business.organizationId` as a **nullable** FK.
   Existing rows remain valid with `organizationId = null`. No existing column
   is renamed or dropped. `ownerId @unique` untouched.
2. **Idempotent backfill (data migration).** For each existing Restaurant with
   `organizationId = null`: create one Organization (name derived from the
   restaurant's name), set `restaurant.organizationId`, set
   `organization.ownerUserId = restaurant.ownerId`. Re-runnable; verifies a 1:1
   count match (orgs created == restaurants).
3. **New-business creation creates an Organization atomically.** Extend the
   existing `createRestaurant` transaction (`restaurant.service.ts`, already a
   `prisma.$transaction`) to create+link an Organization in the same
   transaction, so no Business is ever created without one.
4. **Resolver populates `organizationId`** (flag-gated) from
   `Business.organizationId`. Code tolerates `null` (treats it as "unresolved,"
   never throws).

**Deliberately NOT in P1:** making `organizationId` `NOT NULL`. It stays
nullable through P1; a later hardening PR can tighten it **after** backfill is
verified in production and every Business is guaranteed to have one. Keeping it
nullable is what makes P1 fully reversible.

---

## 6. Repository impact

| Area | Path | Nature of change |
|---|---|---|
| Schema (design only here) | `apps/api/prisma/schema.prisma` | Add `Organization` model + `Business.organizationId?` (additive). **Authorized separately; not in this spec.** |
| Migration | `apps/api/prisma/migrations/*` | New additive migration (table + nullable column) + a data backfill step. **Separately authorized.** |
| New module | `apps/api/src/modules/organizations/` | `organization.service.ts` — create, backfill helper, read-by-business. |
| Business creation | `apps/api/src/modules/restaurants/restaurant.service.ts` | Extend `createRestaurant`'s existing transaction to create+link an Organization. |
| Tenant Context | `apps/api/src/modules/tenancy/tenant-context.ts` | Resolver populates `organizationId` (one extra read; flag-gated via the middleware). |
| Config | `apps/api/src/config/env.ts` | Reuse existing `TENANT_CONTEXT_ENABLED` — **no new flag** required. |
| Tests | `apps/api/src/modules/organizations/*.test.ts`, resolver + restaurant tests | Backfill, creation, resolver-population, and parity/no-regression. |

**Not touched in P1:** `lib/jwt.ts` (JWT payload), `middleware/require-auth.ts`
(auth behavior), `require-role.ts`, `apps/web/**`, and the P0 tenancy middleware
wiring in `app.ts` (the resolver change is inside `tenant-context.ts`, not the
middleware mount).

---

## 7. Risks

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| R1 | **Backfill incorrectness** — not exactly one Organization per Business. | Medium | Idempotent backfill keyed on `organizationId IS NULL`; post-run assertion that `count(Organization) == count(Restaurant)` and every restaurant has a non-null `organizationId`. |
| R2 | **New Business created without an Organization** (orphan). | Low | Create+link inside the existing `createRestaurant` `$transaction` — atomic; a failure rolls back both. |
| R3 | **Nullable `organizationId` read as if always present.** | Medium | Contract: `organizationId` is nullable through P1; resolver and any reader tolerate `null`. No `NOT NULL`, no code assuming non-null. |
| R4 | **Pre-empting P2** by adding roles/memberships to Organization. | Low | Guardrail: Organization carries only `ownerUserId` (a pointer), never roles. Membership is P2. |
| R5 | **Pre-empting P8** by allowing a second Business under an Organization. | Low | P1 enforces 1:1; creation path never attaches a Business to an existing Organization. |
| R6 | **Resolver extra read** for `organizationId` on every authenticated request (flag on). | Low | Single indexed lookup; fetch `organizationId` alongside the existing `businessId` resolution (one query returning both); memoized per request; only when flag on (not prod at merge). |
| R7 | **First BOS schema migration** trips the CI migration-check or a deploy. | Low | Additive migration with a paired migration file (satisfies the check); nullable column needs no backfill to be valid; backfill is a separate, idempotent, reversible step. |
| R8 | **Authorization drift** — someone treats `organizationId` as an auth boundary in P1. | Low | Spec + code comments state Organization is descriptive only in P1; no `requireRole`/scoping change. |

**Behavioral risk to existing users with the flag off: none.** With the flag
off, the only observable change is the presence of new (unused) data; no request
path reads `organizationId`.

---

## 8. Acceptance criteria

1. An **`Organization`** entity exists; **`Business.organizationId`** is a
   **nullable** FK. `Restaurant.ownerId @unique` is unchanged.
2. **Backfill:** every existing Business has exactly one Organization
   (`count` parity verified); each `Organization.ownerUserId` equals the
   Business's `ownerId`.
3. **New Business creation** atomically creates and links exactly one
   Organization (proven by test; failure rolls back both).
4. **Tenant Context:** with the flag **on**, `req.tenant.organizationId` is the
   Business's Organization id (and `null` only if genuinely unresolved, without
   throwing); with the flag **off**, it is `null` (exact P0 behavior).
5. **No behavior change:** no endpoint response, status, or authorization
   behavior changes; the full existing suite passes unchanged; all
   `restaurantId` scoping continues to work.
6. **Guardrails honored:** no Membership/roles, no billing, no Location, no
   multi-Business behavior, no `NOT NULL` on `organizationId`, no `ownerId`
   change, no `apps/web` change, no JWT/`requireAuth` change.
7. **Reversibility:** the change is additive (new table + nullable column +
   flag-gated resolver step) and revertible per §9.
8. CI green: lint, typecheck, tests, build, and migration-check (with the
   paired migration file present).

---

## 9. Rollback strategy

Reversible at multiple independent levels, none destructive:

1. **Flag rollback (no deploy):** keep `TENANT_CONTEXT_ENABLED` off (its
   default). The resolver never populates `organizationId`; the new columns/rows
   are simply unused data. **Exact P0 behavior.** This is the production state at
   merge.
2. **Code revert (resolver step):** revert the `tenant-context.ts` population
   change; `organizationId` returns to `null` everywhere. New-Business creation
   can also be reverted to not create an Organization (leaving new rows'
   `organizationId` null — still valid because the column is nullable).
3. **Data rollback:** because `organizationId` is nullable and the backfill only
   *adds* Organizations and sets a nullable FK, rolling back is safe — the
   column can be ignored, nulled, or the additive table dropped in a follow-up
   migration. No existing data was mutated or removed.
4. **Per-PR revert:** each P1 PR (see §10) is independently revertible; nothing
   outside the tenancy/organizations/restaurants surface depends on the new
   data.

**Why rollback is safe:** additive schema only (new table + nullable column),
no existing column changed, no data destroyed, resolver step flag-gated, and no
consumer depends on `organizationId` yet.

---

## 10. PR breakdown

Small, additive, independently reviewable PRs (mirroring the P0 cadence). Each
must be green on lint/typecheck/test/build/migration-check before the next.

### PR-P1.1 — Organization entity + additive schema (inert)
- **Adds:** the `Organization` model and the nullable `Business.organizationId`
  FK (schema + one additive migration), plus a new
  `modules/organizations/organization.service.ts` with create/read helpers.
- **Not yet:** no backfill, no creation-path wiring, no resolver change.
- **Effect:** new empty table + nullable column; nothing populates or reads
  them. Fully inert. Unit tests for the service helpers.

### PR-P1.2 — Backfill + new-business creation creates an Organization
- **Adds:** the idempotent backfill (one Organization per existing Restaurant,
  set `organizationId` + `ownerUserId`) and extends `createRestaurant`'s
  transaction to create+link an Organization for new Businesses.
- **Proves:** count parity (orgs == restaurants), `ownerUserId == ownerId`,
  atomic creation (rollback on failure), idempotent re-run.
- **Effect:** every Business now has exactly one Organization; still nothing
  *reads* `organizationId`.

### PR-P1.3 — Populate `TenantContext.organizationId` (flag-gated)
- **Adds:** the resolver step that sets `req.tenant.organizationId` from the
  Business's Organization; tolerates `null`; single memoized read.
- **Proves:** flag-off → `organizationId` null (P0 parity); flag-on →
  `organizationId` equals the Business's Organization; never throws on an
  unresolved org.
- **Effect:** the Organization layer is observable end-to-end through Tenant
  Context, with **no consumer yet** (consumers arrive at billing, P6) and **no
  behavior change**.

> Optional later hardening (a **separate** PR, not part of P1's definition of
> done): once backfill is verified in production, tighten `organizationId` to
> `NOT NULL`. Excluded from P1 to preserve full reversibility.

**Exit signal for the next phase:** with P1 done, `req.tenant.organizationId` is
populated and correct, and every Business sits under exactly one Organization —
the structural precondition for **P2 (Membership)** and, later, **P6 (Billing at
the Organization)**. P1 succeeds precisely when those phases can build on the
Organization without reshaping anything P1 created.

---

*End of P1 Organization Layer execution specification. This document specifies
work only; it implements nothing. Implementation is authorized separately and
must remain additive, flag-gated where it touches request behavior, schema-safe
(nullable, no destructive change), and behavior-preserving, exactly as scoped
above.*
