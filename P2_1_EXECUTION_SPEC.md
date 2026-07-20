# OrderVora — P2.1 Execution Specification
## Membership entity + MembershipRole enum + MembershipScope enum (inert)

> **Document type:** Executable specification for **BOS Phase 2, PR-P2.1** — the
> first, inert building block of the Membership (scoped-roles) layer.
> **Scope:** **Documentation only.** No code, no `schema.prisma` changes, no
> migrations, no PR, no implementation. Actual schema/migration/service code is
> authorized separately at implementation time.
> **Prime directive:** **Additive and inert.** P2.1 introduces the data shape
> and its access surface but wires them nowhere — no backfill (P2.2), no
> creation-path integration (P2.3), no Tenant Context population (P2.4), no
> authorization change (P2.5/P2.6). Nothing reads a Membership after this PR.
> **Sources:** `BOS_PHASE2_EXECUTION_PLAN.md` (P2 goals/architecture; PR-P2.1),
> `BUSINESS_OS_FOUNDATION.md` (§3, §7), `P1_ORGANIZATION_EXECUTION_SPEC.md`
> (the P1.1 pattern this mirrors).
> **Repository:** `abukeeth/core` @ `main` `657985c` (after Phase 1 / P1.3 merged).
> **Date:** 2026-07-20.

---

## 1. Current state P2.1 builds on (verified on `main`)

- **Phase 1 complete:** `Organization` exists (1:1:1 with Business + owner), and
  `Organization.ownerUserId` is the **owner pointer** P2 later derives the first
  `OWNER` membership from. `req.tenant.organizationId` is populated by the
  resolver.
- **Authorization today:** a single global `Role` enum on `User`
  (`ADMIN`, `RESTAURANT_OWNER`, `RESTAURANT_STAFF`), checked by `requireRole`;
  scoping is by `restaurantId` in services. `User.restaurantId`
  (`RestaurantMembers`) links staff to a business; `Restaurant.ownerId @unique`
  links the owner.
- **`TenantContext` already reserves `memberships: []`** — P2.4 will populate it;
  P2.1 only defines the entity behind it.
- **Schema conventions** (to match): UUID string PKs (`@id @default(uuid())`),
  `SCREAMING_SNAKE_CASE` enum members, co-located `@@index`, explicit named
  relations, `createdAt/updatedAt` timestamps.

**P2.1 is the exact analogue of P1.1** (which added the `Organization` entity +
nullable FK + service, inert): add the `Membership` entity + its two enums + a
minimal service, reviewable in isolation, consumed by nothing yet.

---

## 2. Objectives

1. Introduce a **`Membership`** entity binding a **User** to a **Role** at a
   **Scope** — the `User × Role × Scope` model from the foundation.
2. Introduce a **`MembershipRole`** enum (`OWNER, ADMIN, MANAGER, STAFF,
   KITCHEN, MARKETING, SUPPORT`) — **separate** from the legacy `Role` enum so
   membership roles never couple to the login role.
3. Introduce a **`MembershipScope`** enum (`ORGANIZATION, BUSINESS, LOCATION`)
   so a membership can be scoped at any level; `LOCATION` is representable now
   but unused until P4.
4. Provide a **minimal membership service** (create/read helpers), unit-tested,
   **wired nowhere**.
5. Remain **fully inert and additive**: no backfill, no creation-path change, no
   resolver change, no authorization change, no reads of Membership anywhere.

### Non-objectives (guardrails)
- **No backfill** (P2.2), **no** `createRestaurant`/staff-invite integration
  (P2.3), **no** `TenantContext.memberships` population (P2.4), **no**
  `requireRole`/permission change (P2.5), **no** membership-primary cutover
  (P2.6).
- **No** change to `User.role`, `Role`, `Restaurant.ownerId`, or
  `User.restaurantId`.
- **No** billing, capabilities, Location entity, or UI change.

---

## 3. Conceptual data model (no schema code)

### 3.1 `MembershipRole` (new enum)
Members, additive and independent of the legacy `Role`:
`OWNER`, `ADMIN`, `MANAGER`, `STAFF`, `KITCHEN`, `MARKETING`, `SUPPORT`.
- Rationale for a **separate enum** (not extending `Role`): the legacy `Role` is
  the *login* role stored on `User` and read by `requireRole`; membership roles
  describe *scoped tenant permissions*. Keeping them separate is fully additive
  and avoids entangling auth-login with tenant authorization (Plan §3.1, R4).

### 3.2 `MembershipScope` (new enum)
`ORGANIZATION`, `BUSINESS`, `LOCATION`.
- Generic scope typing so P4 (Location) needs **no reshape**. `LOCATION` is a
  valid value now but **no membership uses it in Phase 2** (no Location entity
  exists until P4).

### 3.3 `Membership` (new entity)
Conceptual fields (final column/relation details decided at implementation, but
must match repo conventions):

| Field | Meaning |
|---|---|
| `id` | UUID PK (`@default(uuid())`). |
| `userId` → `User` | The member. Named relation (e.g. `"UserMemberships"`); `User` gains a `memberships Membership[]` back-relation. |
| `role` : `MembershipRole` | The scoped role. |
| `scopeType` : `MembershipScope` | Which level the grant applies at. |
| `scopeId` : `String` | The id of the Organization / Business (Restaurant) / Location the grant targets. **Polymorphic by convention** — not a hard FK, because it can reference three different tables (see §3.4). |
| `createdAt` / `updatedAt` | Timestamps. |

**Cardinality:** **many memberships per user** (a user may hold roles across
several scopes) and many memberships per scope — the shape P8/franchise needs,
introduced now. No uniqueness constraint is imposed in P2.1 (dedup/uniqueness
rules, if any, are a backfill/creation concern for P2.2/P2.3).

**Indexes:** `@@index([userId])` (resolve a user's memberships — the P2.4 read
path) and `@@index([scopeType, scopeId])` (resolve who has access to a scope —
future team-management/admin reads). Optionally `@@index([userId, scopeType,
scopeId])` if lookups warrant it; start with the two above.

### 3.4 Scope reference: polymorphic `scopeId` (design decision)
`scopeId` references one of three tables depending on `scopeType`, so it is a
**soft reference** (a plain `String`, no database FK). Rationale:
- A single hard FK can't point at three tables; splitting into
  `organizationId?/businessId?/locationId?` triple-nullable columns is an
  alternative but adds columns that are mostly null and needs a check
  constraint, and `LOCATION` doesn't exist yet.
- The `(scopeType, scopeId)` pair + the composite index gives correct,
  indexable lookups. Referential integrity for scope targets is enforced in the
  service/backfill layer (P2.2/P2.3), consistent with how the platform already
  scopes by `restaurantId` in application code.
- This keeps P2.1 additive and avoids a Location FK before P4. *(If the team
  prefers explicit nullable FKs later, that is an additive migration — not a
  reshape of the `(scopeType, scopeId)` contract.)*

> **Architectural note (accepted 2026-07-20).** The polymorphic
> `Membership.scopeId` (soft reference, no DB FK) is **accepted for Phase 2**.
> **FK hardening is deferred and must be re-evaluated during P4/P5, after the
> Location entity exists** — at which point explicit, per-scope foreign keys (or
> equivalent DB-level referential integrity, alongside RLS in P5) can be added
> **additively** without reshaping the `(scopeType, scopeId)` contract. Until
> then, referential integrity for scope targets is enforced in the
> service/backfill layer, consistent with the platform's existing app-layer
> `restaurantId` scoping.

---

## 4. Membership service (minimal, inert)

A new `apps/api/src/modules/memberships/membership.service.ts` with create/read
helpers only — **not imported anywhere** in P2.1:

- `createMembership({ userId, role, scopeType, scopeId })` → creates a Membership.
- `getMembershipsForUser(userId)` → returns the user's memberships (the P2.4
  read path, defined now so it's reviewable and unit-tested).
- *(Optional)* `getMembershipsForScope(scopeType, scopeId)` → memberships on a
  scope (future team/admin reads). Include only if trivial; otherwise defer.

These mirror P1.1's `organization.service` (create + read helpers, inert).

---

## 5. Repository impact

| Area | Path | Nature of change |
|---|---|---|
| Schema (design only here) | `apps/api/prisma/schema.prisma` | Add `Membership` model + `MembershipRole` + `MembershipScope` enums + `User.memberships` back-relation + indexes. **Additive; authorized separately.** |
| Migration | `apps/api/prisma/migrations/<ts>_p2_1_membership/` | New additive migration (enums + table + indexes). **Separately authorized.** |
| New module | `apps/api/src/modules/memberships/membership.service.ts` | Minimal create/read helpers. |
| Tests | `apps/api/src/modules/memberships/membership.service.test.ts` | Unit tests (mocked prisma), mirroring `organization.service.test.ts`. |

**Not touched in P2.1:** `Role`/`User.role`, `Restaurant.ownerId`,
`User.restaurantId`, the tenancy resolver/middleware (`tenant-context*.ts`),
`require-auth.ts`/`require-role.ts`, `restaurants/*`, `apps/web/**`, `app.ts`,
`config/env.ts`.

---

## 6. Migration strategy (additive)

- **DDL-only, additive:** create the two enums and the `Membership` table with
  its indexes; add the `User.memberships` back-relation (no column change on
  `User` — a Prisma back-relation is virtual). Existing rows are unaffected;
  the table starts **empty**.
- **Generate the migration from the schema diff** (Prisma `migrate diff`
  datamodel→datamodel, as done for P1.1) and verify it applies cleanly against a
  real Postgres with **no drift** (`migrate deploy` + drift check), matching the
  P1.1 verification.
- **Migration-check CI:** the schema change is paired with the new migration
  file → the check passes (same as P1.1).
- **No `NOT NULL`/uniqueness beyond the essentials** (`role`, `scopeType`,
  `scopeId`, `userId` are required; no unique constraint on the triple in P2.1).

---

## 7. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **Over-constraining early** (e.g. a unique `(userId, role, scopeType, scopeId)` that later blocks legitimate duplicates or backfill idempotency). | 🟡 Low | No uniqueness in P2.1; add deliberately in P2.2/P2.3 if needed, with backfill idempotency designed around it. |
| R2 | **Polymorphic `scopeId` has no DB FK** → possible dangling scope references. | 🟡 Low | Integrity enforced in service/backfill (P2.2/P2.3), consistent with existing `restaurantId` app-layer scoping; `(scopeType, scopeId)` index keeps lookups correct. Explicit FKs remain an additive future option. |
| R3 | **Enum coupling** — reusing/extending `Role` instead of a separate enum. | 🟡 Low | Separate `MembershipRole` enum; `Role`/`User.role` untouched. |
| R4 | **Pre-empting later phases** (Location behavior, backfill, auth). | 🟡 Low | `LOCATION` value exists but is unused; service is inert; no reads anywhere. Guardrails §2. |
| R5 | **First Phase-2 migration** trips CI. | 🟢 V.Low | Additive migration paired with the schema change (P1.1 pattern); verified via `migrate deploy` + drift check. |

**Behavioral risk: none.** The entity is unread; no request path changes.

---

## 8. Acceptance criteria

1. **`MembershipRole`** enum exists with `OWNER, ADMIN, MANAGER, STAFF, KITCHEN,
   MARKETING, SUPPORT`; **`MembershipScope`** enum exists with `ORGANIZATION,
   BUSINESS, LOCATION`.
2. **`Membership`** entity exists (`id`, `userId → User`, `role`, `scopeType`,
   `scopeId`, timestamps) with `@@index([userId])` and `@@index([scopeType,
   scopeId])`; modeled many-per-user and many-per-scope; no uniqueness
   constraint in P2.1.
3. `User.memberships` back-relation exists; **no** change to `User.role`,
   `Role`, `Restaurant.ownerId`, or `User.restaurantId`.
4. **Membership service** (`createMembership`, `getMembershipsForUser`) exists
   and is unit-tested (mocked prisma), and is **imported by nothing** outside
   its own module (proven inert).
5. **Additive migration** is present and paired with the schema change; it
   applies cleanly to a real Postgres with **no drift**.
6. **Guardrails honored:** no backfill, no creation-path change, no resolver
   change, no authorization change, no billing/capabilities/Location-entity/UI
   change.
7. **CI green:** lint, typecheck, tests, build, migration-check.
8. **Reversibility:** additive-only (new enums + table); revertible by dropping
   them; nothing depends on the entity yet.

---

## 9. Rollback strategy

- **Inert by construction:** nothing reads `Membership`, so removing it has no
  behavioral effect.
- **Additive schema:** rollback = drop the `Membership` table + the two enums
  (a compensating migration) — no existing column altered, no data mutated.
- **Per-PR revert:** reverting P2.1 removes the module, service, and schema
  additions cleanly; no other code depends on them.

---

## 10. PR breakdown (P2.1 is a single PR)

**PR-P2.1 — Membership entity + enums + service (inert).** One PR:
- `MembershipRole` + `MembershipScope` enums, `Membership` model +
  `User.memberships` back-relation + indexes (additive schema + paired
  migration).
- `memberships/membership.service.ts` (create/read helpers) +
  `membership.service.test.ts`.
- Verified: lint/typecheck/tests/build/migration-check green; `migrate deploy` +
  drift check clean; entity imported by nothing outside its module.

> **Exit signal for P2.2:** with the Membership entity + enums + service in
> place (empty table, inert), the idempotent **backfill** (PR-P2.2) can create
> Owner/Staff memberships from existing owners/staff and `Organization.ownerUserId`.
> Do not start P2.2 (backfill), P2.3 (creation), P2.4 (resolver), P2.5
> (dual-read), or P2.6 (cutover) as part of P2.1.

---

*End of P2.1 execution specification. This document specifies work only; it
implements nothing. Implementation is authorized separately and must remain
additive, inert (unread), schema-safe, and behavior-preserving, exactly as
scoped above.*
