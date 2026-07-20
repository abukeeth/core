# OrderVora — BOS Phase 2 Execution Plan
## Phase 2: Membership & Scoped Roles

> **Document type:** Execution plan for **BOS Phase 2 (P2 — Membership & Scoped
> Roles)**, preceded by a verification audit of Phase 1.
> **Scope:** **Documentation only.** No code, no `schema.prisma` changes, no
> migrations, no PR, no implementation. This plan defines *what* Phase 2 builds
> and *how to know it's done*.
> **Prime directive:** **Additive, backward-compatible, reversible.** Access is
> never made *narrower* than today during the transition (dual-read). The
> `Restaurant`/`restaurantId` engine and current `Role`-based authorization keep
> working at all times.
> **Sources:** `BUSINESS_OS_FOUNDATION.md` (§3, §7), `BUSINESS_OS_IMPLEMENTATION_PLAN.md`
> (Phase P2), `MASTER_EXECUTION_SEQUENCE.md` (Part A / P2).
> **Repository:** `abukeeth/core` @ `main` `657985c` (after PR #23 / P1.3 merged).
> **Date:** 2026-07-20.

---

## 0. Phase 1 verification audit (on `main` after P1.1–P1.3)

Verified directly against `main`. **All four sub-phases are present, correct, and
consistent — no remaining Phase 1 gaps in production code.**

| Sub-phase | Requirement | Verified evidence on `main` | Status |
|---|---|---|---|
| **P1.1** | Organization entity + nullable `Business.organizationId` + service | `model Organization` (`schema.prisma:211`); `organizationId String?` + `organization` relation (`:195–196`); `User.ownedOrganizations` (`:63`); `@@index([organizationId])` (`:201`), `@@index([ownerUserId])` (`:224`); migration `20260719000000_p1_organization`; service `createOrganization` / `getOrganizationById` / `getOrganizationIdForBusiness` | ✅ COMPLETE |
| **P1.2a** | Atomic org creation in `createRestaurant` | `tx.organization.create({ name: businessName, ownerUserId: ownerId })` then Restaurant created with `organizationId: organization.id`, all in the one `$transaction`; `businessName` shared (`restaurant.service.ts:67–89`) | ✅ COMPLETE |
| **P1.2b** | Idempotent backfill of existing businesses | Migration `20260719010000_p1_2b_backfill_organizations`: `INSERT … WHERE organizationId IS NULL` → `UPDATE … WHERE organizationId IS NULL` (CTE, atomic, guarded) | ✅ COMPLETE |
| **P1.3** | Resolver populates `TenantContext.organizationId` | `resolveTenantContext` resolves `organizationId` via `getOrganizationIdForBusiness` (injectable, business-gated, never-throws, `?? null`) (`tenant-context.ts:104,124`) | ✅ COMPLETE |

**Invariant established:** every Business sits under exactly one Organization
(`ownerUserId == ownerId`); `req.tenant.organizationId` is populated when the
flag is on. The only production `prisma.restaurant.create` call site is inside
`createWithUniqueReferralCode`, which is invoked by the org-creating
`createRestaurant` transaction — so **no production path creates a Business
without an Organization**.

**Intentionally deferred (NOT gaps — documented Phase-1 decisions):**
1. **`organizationId` remains nullable** (`schema.prisma:195`). The `NOT NULL`
   hardening was explicitly deferred to preserve reversibility. Phase 2 does not
   require it, but it is a natural candidate for a small hardening PR once
   confidence is high (see §6/§7 notes).
2. **`seed-beta.ts:147` creates a Restaurant directly** (bypassing
   `createRestaurant`), so a beta-seeded row can have a null `organizationId`.
   Dev/beta only; the resolver tolerates null. Non-blocking; can be routed
   through `createRestaurant` or covered by re-running the backfill.

Neither affects Phase 2's correctness. **Phase 1 is complete.**

---

## 1. What Phase 2 is

**Phase 2 introduces `Membership` — the scoped access model — as the
authoritative answer to "who can do what, where."** Today authorization is a
single global `Role` on `User` (`ADMIN`, `RESTAURANT_OWNER`,
`RESTAURANT_STAFF`) checked by `requireRole`, plus service-level `restaurantId`
scoping. Phase 2 adds a **Membership** entity binding a **User** to a **Role**
at a **Scope** (Organization / Business / Location), expands the role
vocabulary, back-fills memberships from today's data, populates
`req.tenant.memberships`, and switches authorization to a **dual-read** model
that consults Membership first and falls back to the legacy `Role` — so access
is never narrower during the transition.

This is the plane the foundation calls out (`BUSINESS_OS_FOUNDATION.md` §7) and
the one every later phase (Location scoping in P4/P7, Capability gating in P3,
Billing admin in P6, franchise in P8) depends on.

### Explicit non-goals (guardrails)
- **No billing** (P6), **no Capability/module gating** (P3), **no Location
  entity** (P4 — Location *scope* is modeled but not yet populated), **no
  multi-business ownership behavior** (P8), **no UI redesign**.
- **No reduction of anyone's current access.** Dual-read guarantees the
  membership path is only ever *additive* to the legacy role path until the
  cutover is proven.
- **No change to `Restaurant.ownerId @unique`** (relaxing it is P8) and **no
  removal of `User.role`** during Phase 2 (kept for dual-read/fallback).

---

## 2. Goals

1. **Model `Membership`** as `User × Role × Scope`, with `Scope` generically
   typed (`ORGANIZATION | BUSINESS | LOCATION` + `scopeId`) so P4 Location
   scoping needs no reshape — even though `LOCATION` is unused until then.
2. **Expand the role vocabulary** additively: introduce `MANAGER`, `KITCHEN`,
   `MARKETING`, `SUPPORT` alongside the existing owner/staff/admin concepts,
   without removing the current `Role` enum values.
3. **Back-fill memberships** deterministically from today's data:
   `RESTAURANT_OWNER` → **Owner @ Organization** (derived from
   `Organization.ownerUserId`, the P1 hand-off) and **@ Business**;
   `RESTAURANT_STAFF` → **Staff @ Business**; platform `ADMIN` stays a
   platform-level concept (not a tenant membership).
4. **Populate `req.tenant.memberships`** by reusing the existing Tenant Context
   resolver (flag-gated, never-throws), filling the reserved `memberships: []`
   slot.
5. **Dual-read authorization:** `requireRole` (and a new capability-agnostic
   permission check) consults Membership within the current Tenant Context,
   falling back to the legacy `User.role`. Effective access must be a **superset
   of today** until an explicit, tested cutover flips membership-primary.
6. **Enforce the financial firewall as a role:** the `KITCHEN` role provably
   cannot read financial fields on the endpoints it touches (the blueprint's
   showcase security example), realized through the membership checks.
7. **Zero behavior change by default:** with the flag off (and before cutover),
   every endpoint behaves exactly as today; the full suite passes.

---

## 3. Architecture impact

### 3.1 Data model (conceptual — no schema here)
- **New `Membership` entity:** `id`, `userId → User`, `role` (expanded enum),
  `scopeType` (`ORGANIZATION | BUSINESS | LOCATION`), `scopeId` (string; the
  Organization/Business/Location id), timestamps, plus an index on
  `(userId)` and on `(scopeType, scopeId)`. Model as **many memberships per
  user** (a user may hold roles across several scopes) — the shape P8/franchise
  needs, introduced now.
- **Role vocabulary:** additive. The cleanest path is a **new `MembershipRole`
  enum** (`OWNER, ADMIN, MANAGER, STAFF, KITCHEN, MARKETING, SUPPORT`) used by
  `Membership`, leaving the existing `User.role` (`Role`) untouched for
  dual-read. (Extending the existing `Role` enum in place is an alternative but
  couples membership roles to the legacy login role; a separate enum is
  cleaner and fully additive.)
- **No change** to `User.role`, `Restaurant.ownerId`, or `User.restaurantId`
  during Phase 2 — all retained for fallback and backward compatibility.

### 3.2 Tenant Context
- `TenantContext.memberships` (currently `[]`) becomes populated by the resolver
  for the authenticated user within the current scope, reusing the P0/P1
  resolver seam. Still flag-gated; still never-throws; reads memberships at most
  once per request.
- `TenantContext` gains no breaking shape change — `memberships` was already
  reserved.

### 3.3 Authorization layer
- **`requireRole` evolves to a dual-read permission check** (or a new
  `requirePermission`/`requireMembership` middleware is introduced alongside it):
  allow if the legacy `req.user.role` permits **OR** a Membership in the current
  Tenant Context permits. This can never *deny* something the legacy path
  allowed → access is a superset during transition.
- **Scope evaluation:** a Business-scoped membership grants access to that
  Business; an Organization-scoped membership grants access to all its
  Businesses. Location-scoped grants are modeled but inert until P4.
- **Financial-firewall enforcement** for `KITCHEN` is expressed as a
  membership/permission rule on the relevant (KDS/orders) endpoints.

### 3.4 What does NOT change
- Storefront/public routes, commerce engine, `requireAuth`/JWT/cookies, the P1
  Organization layer, `apps/web`, and every existing response shape.

---

## 4. Dependencies

- **Requires (satisfied):** P0 Tenant Context seam (resolver + flag), P1
  Organization layer (Owner @ Organization is derived from
  `Organization.ownerUserId`; every Business has an Organization to scope to).
- **Depended on by:** P3 (Capabilities gate features per role/scope), P4/P7
  (Location-scoped memberships become usable once Location exists), P6 (Billing
  admin is Owner @ Organization), P8 (franchise/multi-business teams).
- **Cross-cutting:** reuses the existing `TENANT_CONTEXT_ENABLED` flag; no new
  flag strictly required, though a distinct **`MEMBERSHIP_PRIMARY`** cutover
  flag is recommended (§7) to separate "populate + dual-read" from
  "membership-authoritative."
- **Deferred boundary:** `Scope = LOCATION` is modeled but not populated until
  P4; do not build Location-scoped behavior in Phase 2.

---

## 5. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **Authorization regression** — the single highest risk of the whole program: a membership check that *denies* something the legacy role allowed. | 🔴 High | **Dual-read**: permit if legacy OR membership permits. The membership path can only *widen* access until an explicit, tested cutover. Comprehensive permission tests for every role×endpoint. |
| R2 | **Backfill incorrectness** — wrong/missing membership for an existing user. | 🟠 Med | Deterministic, idempotent backfill keyed on existing `User.restaurantId`/`role` and `Organization.ownerUserId`; post-run parity assertions (one Owner membership per org owner, one Staff membership per staff). |
| R3 | **Financial-firewall leak** — `KITCHEN` sees money. | 🟠 Med | Explicit tests that KITCHEN-scoped access excludes financial fields on KDS/orders endpoints; treat as an acceptance gate. |
| R4 | **Role-enum coupling** — extending the login `Role` enum in place entangles auth-login with tenant roles. | 🟡 Low | Use a **separate `MembershipRole` enum**; leave `User.role` untouched. |
| R5 | **Premature cutover** — flipping membership-primary before coverage is complete. | 🟠 Med | Gate the cutover behind its own flag (`MEMBERSHIP_PRIMARY`), default off; flip only after dual-read parity is proven in staging. |
| R6 | **Scope ambiguity** — a user with multiple memberships across scopes. | 🟡 Low | Evaluate permission as "any membership in the request's Tenant Context scope chain permits"; Org-scope implies its Businesses. Deterministic, tested. |
| R7 | **Resolver cost** — extra membership read per authenticated request (flag on). | 🟡 Low | Single indexed read by `userId`, memoized per request; only when flag on. |
| R8 | **Pre-empting P4/P8** — building Location scope or multi-business behavior now. | 🟡 Low | Model `LOCATION` scope + many-memberships-per-user, but implement only ORG/BUSINESS behavior; guardrails in §1. |

---

## 6. Acceptance criteria

1. **`Membership` entity** exists (`User × MembershipRole × (scopeType, scopeId)`),
   additive, with indexes on `userId` and `(scopeType, scopeId)`;
   `LOCATION` scope is representable but unused.
2. **Role vocabulary** includes `OWNER/ADMIN/MANAGER/STAFF/KITCHEN/MARKETING/
   SUPPORT` (separate enum); legacy `User.role` unchanged.
3. **Backfill** creates: exactly one **Owner @ Organization** per organization
   owner (derived from `Organization.ownerUserId`), the corresponding **Owner @
   Business**, and one **Staff @ Business** per existing `RESTAURANT_STAFF`;
   idempotent; count-parity verified.
4. **`req.tenant.memberships`** is populated (flag on) from the user's
   memberships, never-throws, `[]` when none/unresolved; flag off → unchanged.
5. **Dual-read authorization:** for every existing endpoint, effective access
   with dual-read enabled is a **superset** of today (no legitimate request is
   newly denied); the full existing suite passes unchanged.
6. **Scoped denial proven:** a Business-scoped membership is denied access to a
   sibling Business (test); an Organization-scoped membership reaches all its
   Businesses (test).
7. **Financial firewall:** a `KITCHEN` membership provably cannot read financial
   fields on the KDS/orders endpoints it touches (test).
8. **Guardrails honored:** no billing, no Capability gating, no Location entity,
   no multi-business behavior, no `ownerId` change, no `User.role` removal, no
   UI change.
9. **Reversibility:** every step additive and revertible; the membership-primary
   cutover is flag-gated and default off.
10. **CI green:** lint, typecheck, tests, build, and migration-check (with paired
    migration for the schema additions).

---

## 7. Implementation order (dependency-ordered)

> The membership-primary **cutover is deliberately the last step**, gated by its
> own flag, so populate + dual-read land and soak before authorization ever
> depends on membership.

1. **Membership entity + role enum (additive schema)** — new `Membership` model
   + `MembershipRole` enum + indexes + paired additive migration. Inert (nothing
   reads it yet), like P1.1.
2. **Membership service** — create/read helpers (`createMembership`,
   `getMembershipsForUser`, scope-aware queries). Not wired.
3. **Backfill (data migration)** — deterministic, idempotent creation of
   Owner/Staff memberships from existing owners/staff + `Organization.ownerUserId`.
   Follows the P1.2b pattern (guarded, atomic, count-parity).
4. **Membership creation on new users/businesses** — `createRestaurant` (owner)
   and the staff-invite flow create the corresponding memberships atomically,
   mirroring P1.2a.
5. **Resolver populates `req.tenant.memberships`** — reuse the resolver seam,
   flag-gated, never-throws (mirrors P1.3). No consumer yet.
6. **Dual-read permission layer** — evolve `requireRole` / add
   `requirePermission` to allow-if-legacy-OR-membership; wire it into endpoints
   **without** removing legacy checks. Superset guarantee + full test matrix.
7. **Membership-primary cutover (flag-gated)** — behind `MEMBERSHIP_PRIMARY`
   (default off), make membership authoritative where proven; keep legacy as
   fallback. Includes the KITCHEN financial-firewall enforcement and
   scoped-denial guarantees.

*(Optional, separate from P2's DoD: the deferred P1 `organizationId` NOT NULL
hardening — sensible to schedule once Owner @ Organization backfill is verified,
but not required for Phase 2.)*

---

## 8. PR breakdown

Small, additive, independently reviewable PRs (matching the P0/P1 cadence). Each
green on lint/typecheck/test/build/migration-check before the next.

| PR | Scope | Depends on | Effect |
|---|---|---|---|
| **P2.1** | `Membership` model + `MembershipRole` enum + additive migration + membership service (create/read) | P1 | Inert entity + access surface; nothing reads it. |
| **P2.2** | Idempotent backfill of Owner/Staff memberships (data migration) | P2.1 | Every existing owner/staff has the correct membership(s); count-parity. |
| **P2.3** | Create memberships on new owners/businesses (`createRestaurant`) + staff-invite flow, atomically | P2.1 | New users/businesses get memberships going forward. |
| **P2.4** | Populate `req.tenant.memberships` in the resolver (flag-gated, never-throws) | P2.1, P2.3 | Memberships observable via Tenant Context; no consumer yet. |
| **P2.5** | Dual-read permission layer (allow legacy OR membership); wire into endpoints; full role×endpoint test matrix | P2.4 | Authorization consults membership as a **superset**; no access removed. |
| **P2.6** | Membership-primary cutover behind `MEMBERSHIP_PRIMARY` (default off) + KITCHEN financial-firewall + scoped-denial enforcement/tests | P2.5 | Membership becomes authoritative where proven, reversibly. |

> **Exit signal for Phase 3 (Capabilities):** with P2 complete, the platform has
> a scoped, membership-based authorization plane. Capabilities (P3) can then gate
> *features* per Business/plan on top of *who-can-act* per membership — the two
> planes the foundation separates. Do not start P3 as part of Phase 2.

---

*End of BOS Phase 2 execution plan. This document plans work only; it implements
nothing. Implementation is authorized separately, PR by PR, and must remain
additive, dual-read (never access-reducing), flag-gated at cutover, schema-safe,
and behavior-preserving, exactly as scoped above.*
