# OrderVora — P0 Execution Specification
## Phase 0: Terminology & Tenant Context

> **Document type:** Executable implementation specification for **BOS Phase 0**.
> **Scope:** **Documentation only.** No code, no `schema.prisma` changes, no
> migrations, no implementation. This spec makes P0 *ready to execute* — it
> defines exactly what to build, how to prove it, and how to undo it, so an
> engineer (human or agent) can implement it in a follow-up authorized change.
> **Prime directive:** P0 is a **pure seam** — it changes *how* the request's
> tenant scope is resolved, without changing *what* any endpoint does. Behavior
> for every existing user must be byte-for-byte identical. **No schema change in
> P0.**
> **Sources:** `BUSINESS_OS_FOUNDATION.md` (§2 Tenant Context, §9 migration),
> `BUSINESS_OS_IMPLEMENTATION_PLAN.md` (Phase 0), `MASTER_EXECUTION_SEQUENCE.md`
> (Part A / P0), `ORDERVORA_SOURCE_OF_TRUTH.md` (current-state facts).
> **Repository:** `abukeeth/core` @ branch
> `claude/ordervora-blueprint-gaps-kwyve1`. **Date:** 2026-07-19.

---

## 1. Objectives

1. **Introduce a single Tenant Context resolution seam** in the API: one place
   that, per authenticated request, produces a `TenantContext` object
   describing *which tenant this request acts within* and *what the actor may
   do there*.
2. **Make `businessId` the canonical scope key in new code**, defined as
   **exactly today's resolved restaurant** — i.e. `TenantContext.businessId ===
   the value `getOwnRestaurantId(userId)` returns today`. No renames, no schema
   change; `restaurantId` remains the physical key everywhere.
3. **Prepare context slots for later phases** (`organizationId`, `locationId`,
   `memberships`, `capabilities`) as **optional/nullable, unpopulated** fields,
   so P1–P6 can fill them in additively without touching call sites again.
4. **Adopt BOS terminology** in new/internal code and docs ("Business" for the
   tenant, "Location" for the place, "Member" for staff) without renaming
   existing public identifiers.
5. **Guarantee zero behavioral change**: the full existing test suite passes
   unchanged; every existing user's access and every endpoint's output are
   identical.

**Explicit non-objectives (out of scope for P0):**
- No `Organization`, `Location`, `Membership`, or `Capability` tables/entities
  (those are P1–P4).
- No RLS / database policies (P5).
- No change to JWT contents, cookies, or the auth flow.
- No route renames (`/api/businesses/...` aliases arrive in later phases).
- No UI redesign.

---

## 2. Technical Approach

### 2.1 The core idea
Today, "which restaurant is this request about?" is answered **ad hoc** inside
services — most commonly by `getOwnRestaurantId(userId)`
(`modules/restaurants/restaurant.service.ts`), which reads `User.restaurantId`.
The access token carries only `{ sub, role }` (`lib/jwt.ts`); it does **not**
carry a restaurant id. Authorization is `requireRole` (role only) plus
service-level ownership lookups.

P0 **hoists that resolution to one middleware** that runs after `requireAuth`,
computes the request's tenant scope once, and attaches it as `req.tenant`
(a `TenantContext`). New code reads `req.tenant.businessId`; existing code is
untouched and keeps working exactly as before. The resolver's `businessId` is
computed from the **same source of truth** used today (`User.restaurantId`), so
it is a strict superset — never a different or narrower value.

### 2.2 Superset guarantee (how "no behavior change" is enforced)
- The resolver returns, for any legacy authenticated request, a `businessId`
  **equal to** what `getOwnRestaurantId(req.user.id)` returns today (including
  `null` when the user has no restaurant yet).
- `role` in the context equals `req.user.role` (unchanged).
- All other context fields (`organizationId`, `locationId`, `memberships`,
  `capabilities`) are **absent/empty** in P0 and are never read by existing
  code.
- Because no existing service is required to *read* `req.tenant` in P0, the seam
  is **inert by default**: attaching it cannot change any current response.

### 2.3 Rollout mechanism
- Introduce the resolver as **opt-in** behind an internal config/environment
  flag (e.g. `TENANT_CONTEXT_ENABLED`, default **on** in non-prod, staged in
  prod) so
  it can be disabled instantly without a redeploy of application logic.
- The resolver **never throws** on the legacy path: if it cannot resolve a
  business (e.g. owner mid-onboarding with no restaurant), it attaches
  `businessId: null` and lets downstream code behave exactly as today.

### 2.4 Caching / performance
- Resolve **once per request**, memoized on the request object. The one extra
  read (`User.restaurantId`) mirrors the lookup services already do, so net DB
  load does not increase materially; where a controller currently calls
  `getOwnRestaurantId`, it can later read `req.tenant.businessId` instead
  (optional cleanup, not required in P0).

---

## 3. Repository Areas Affected

| Area | Path | Nature of change |
|---|---|---|
| Auth middleware | `apps/api/src/middleware/require-auth.ts` | Unchanged logic; `req.user` remains the input to the resolver. |
| Role middleware | `apps/api/src/middleware/require-role.ts` | Unchanged in P0 (may *optionally* read context later; not required now). |
| **New** tenancy module | `apps/api/src/modules/tenancy/` (or `apps/api/src/lib/tenant-context.ts`) | New resolver + `TenantContext` type + Express type augmentation. |
| App wiring | `apps/api/src/app.ts` | Insert the resolver middleware immediately after `cookieParser()`/auth, before route mounting. |
| Config | `apps/api/src/config/env.ts` | Add optional `TENANT_CONTEXT_ENABLED` flag (validated, defaulted). |
| Existing scope helper | `apps/api/src/modules/restaurants/restaurant.service.ts` | **No behavior change.** `getOwnRestaurantId` becomes the resolver's underlying source (may be re-exported/reused). |
| Docs | `PROJECT_MEMORY.md` | Terminology note: "Business" = tenant; new code reads `req.tenant`. |
| Tests | `apps/api/src/**/*.test.ts` (new files only) | New unit/integration tests for the resolver + a superset assertion. |

**Not touched in P0:** `schema.prisma`, any migration folder, `lib/jwt.ts`,
cookies, storefront/public routes, the web app (`apps/web`), commerce engine.

---

## 4. Required PR Breakdown

P0 ships as **three small, additive, independently reviewable PRs**, each
green on the full suite before the next.

### PR-P0.1 — `TenantContext` type + resolver (no wiring)
- Adds the `TenantContext` interface, the Express `Request` augmentation
  (`req.tenant?`), and a pure resolver function `resolveTenantContext(req)` that
  computes `{ businessId, role }` from `req.user` using the existing
  `User.restaurantId` source.
- Adds the `TENANT_CONTEXT_ENABLED` config flag (default off in this PR).
- **Not yet wired** into `app.ts` → zero runtime effect. Fully unit-tested.
- *Reviewable in isolation; cannot change behavior.*

### PR-P0.2 — Wire the resolver middleware (flagged on in non-prod)
- Mounts the resolver in `app.ts` after auth, before routes, **guarded by the
  flag**. Attaches `req.tenant` for authenticated requests.
- Adds integration tests asserting `req.tenant.businessId` equals
  `getOwnRestaurantId(user)` across owner/staff/admin/no-restaurant cases.
- Flag on in dev/staging, staged (off→on) in prod.
- *Because no existing code reads `req.tenant`, behavior is unchanged even with
  the flag on.*

### PR-P0.3 — Terminology adoption + one reference consumer
- Updates `PROJECT_MEMORY.md` with the terminology + "read `req.tenant`"
  convention.
- Migrates **one** low-risk existing controller (e.g. `restaurant.controller`'s
  `getMine`) to read `req.tenant.businessId` instead of calling
  `getOwnRestaurantId` directly — a **proof-of-consumption** that the seam works
  end-to-end, behind the same flag, with tests proving identical output.
- *Establishes the pattern the rest of the codebase will follow in later phases;
  intentionally minimal.*

> Ordering rule: PR-P0.1 → PR-P0.2 → PR-P0.3. Each is revertible on its own.

---

## 5. Files Expected to Change

*Additive/new files marked **[new]**; existing files listed with the exact
nature of the edit. No file is renamed or deleted.*

**PR-P0.1**
- **[new]** `apps/api/src/modules/tenancy/tenant-context.ts` — `TenantContext`
  interface + `resolveTenantContext()`.
- **[new]** `apps/api/src/modules/tenancy/tenant-context.types.ts` — Express
  `Request` augmentation (`tenant?: TenantContext`).
- **[new]** `apps/api/src/modules/tenancy/tenant-context.test.ts` — unit tests.
- `apps/api/src/config/env.ts` — add optional `TENANT_CONTEXT_ENABLED`.

**PR-P0.2**
- `apps/api/src/app.ts` — import + mount the resolver middleware (flag-guarded)
  after `cookieParser()` and the auth layer, before route mounting (~line 215+).
- **[new]** `apps/api/src/modules/tenancy/tenant-context.middleware.ts` — the
  Express middleware wrapper around `resolveTenantContext()`.
- **[new]** `apps/api/src/modules/tenancy/tenant-context.integration.test.ts`.

**PR-P0.3**
- `apps/api/src/modules/restaurants/restaurant.controller.ts` — one handler
  reads `req.tenant.businessId` (behind flag; fallback to existing lookup when
  flag off / context null).
- `PROJECT_MEMORY.md` — terminology + convention note.
- (test update alongside the touched controller.)

**Never in P0:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/*`,
`apps/api/src/lib/jwt.ts`, `apps/web/**`.

---

## 6. API Impact

- **No new public endpoints, no removed endpoints, no changed request/response
  shapes.** `req.tenant` is server-internal and never serialized to clients in
  P0.
- Existing routes (`/api/restaurants/...`, `/api/public/...`, `/api/customer/...`,
  `/api/admin/...`, webhooks) behave identically.
- Route params and the `/me`-style owner resolution are unchanged. (The
  `/api/businesses/...` alias family is **out of scope** — it arrives in a later
  phase.)
- **Public/unauthenticated routes** (storefront, public menu, checkout): the
  resolver only runs for authenticated requests; public routes are unaffected
  (no `req.user`, so no `req.tenant`, exactly as today).

---

## 7. Middleware Impact

- **New middleware:** `tenantContextMiddleware` — runs **after** `requireAuth`
  has populated `req.user` (or is a no-op when there is no authenticated user),
  and **before** route handlers. It is idempotent and memoized.
- **`requireAuth`:** unchanged. Still the sole producer of `req.user`.
- **`requireRole`:** unchanged in P0. (Future phases may have it consult
  `req.tenant.memberships`; explicitly **not** in P0.)
- **Ordering in `app.ts`:** `... → cookieParser() → [auth on protected routers]
  → tenantContextMiddleware → routers`. On routers that don't use `requireAuth`
  (public), the middleware sees no `req.user` and attaches nothing.
- **Failure semantics:** the middleware **must not** turn a currently-successful
  request into a failure. On any resolution error it logs and attaches
  `businessId: null` (never throws), preserving today's behavior.

---

## 8. Tenant Context Design

### 8.1 Shape (P0 populates only the first two fields)
```
TenantContext {
  businessId:      string | null      // P0: == getOwnRestaurantId(user); the scope key (physical: restaurantId)
  role:            Role   | null      // P0: == req.user.role

  // Reserved slots — declared in P0, populated in later phases, never read yet:
  organizationId:  string | null      // P1
  locationId:      string | null      // P4 (default location)
  memberships:     Membership[]       // P2 (empty [] in P0)
  capabilities:    CapabilitySet      // P3 (empty set in P0)

  // Provenance (for debugging/telemetry, not authorization):
  resolvedFrom:    "legacy-user-restaurant" | ... // P0 always "legacy-user-restaurant"
}
```

### 8.2 Resolution algorithm (P0)
1. If `!req.user` → attach nothing (public/unauthenticated). Return.
2. `businessId = User.restaurantId for req.user.id` (the same read
   `getOwnRestaurantId` performs). May be `null` (owner mid-onboarding, fresh
   admin).
3. `role = req.user.role`.
4. Reserved fields set to their empty defaults (`organizationId: null`,
   `locationId: null`, `memberships: []`, `capabilities: empty`,
   `resolvedFrom: "legacy-user-restaurant"`).
5. Memoize on the request; return.

### 8.3 Design rules
- **Single source of truth:** `businessId` derives from `User.restaurantId`
  today — not from route params, not from the JWT (which has no restaurant id).
  This exactly matches current behavior and avoids inventing a new scoping path.
- **Additive, forward-compatible:** later phases *only add* population logic to
  the reserved fields; the interface and the `req.tenant` access pattern never
  change again.
- **Authorization stays external in P0:** `TenantContext` is *descriptive*, not
  *enforcing*. It does not grant or deny anything in P0 (that evolves in P2/P5).
- **Never a client contract:** `req.tenant` is internal; it is not returned in
  responses, so it can evolve freely across phases.

---

## 9. Acceptance Tests

*All are new tests; none modify existing tests. "Flag on" unless noted.*

### 9.1 Superset equivalence (the central guarantee)
- **T1 — Owner:** For an owner with a restaurant, `req.tenant.businessId`
  **equals** `getOwnRestaurantId(owner.id)` and `req.tenant.role === "RESTAURANT_OWNER"`.
- **T2 — Staff:** For staff linked to a restaurant, `businessId` equals that
  restaurant's id; `role === "RESTAURANT_STAFF"`.
- **T3 — Owner mid-onboarding (no restaurant):** `businessId === null`, request
  still succeeds exactly as today (no 4xx/5xx introduced).
- **T4 — Admin:** platform admin request resolves `role === "ADMIN"`,
  `businessId` per today's rules (null unless the admin also owns one).

### 9.2 Inertness / no-behavior-change
- **T5 — Public route unaffected:** a storefront/public-menu request has no
  `req.user`, therefore no `req.tenant`; response identical to baseline.
- **T6 — Flag off = no-op:** with `TENANT_CONTEXT_ENABLED=false`, `req.tenant`
  is undefined and all endpoints behave exactly as before.
- **T7 — Full existing suite passes unchanged** (166 API test files) with the
  flag **on**, proving the seam changes no existing behavior.

### 9.3 Resolver robustness
- **T8 — Never throws:** simulate a resolution error (e.g. transient DB read
  failure in the resolver) → middleware attaches `businessId: null`, logs, and
  the request proceeds; no request that succeeds today fails because of the
  resolver.
- **T9 — Memoization:** the resolver reads the user's restaurant **at most once**
  per request (spy/asserted), guarding against N+1 regressions.

### 9.4 Proof-of-consumption (PR-P0.3)
- **T10 — Reference consumer parity:** the one migrated handler
  (`getMine`) returns **identical** output whether it resolves via
  `req.tenant.businessId` (flag on) or the legacy `getOwnRestaurantId` path
  (flag off) — asserted on the same fixtures.

---

## 10. Rollback Strategy

P0 is designed to be **instantly and safely reversible at three levels**:

1. **Flag rollback (no deploy):** set `TENANT_CONTEXT_ENABLED=false`. The
   resolver stops attaching `req.tenant`; the one reference consumer (P0.3)
   falls back to the legacy `getOwnRestaurantId` path. System returns to exact
   pre-P0 behavior immediately.
2. **PR revert (per PR):** each of PR-P0.1/2/3 is an isolated, additive commit
   revertible on its own with no data implications (there is **no schema change,
   no migration, no data written** in P0).
3. **Full-phase revert:** reverting all three PRs removes the tenancy module and
   the `app.ts` wiring entirely; because nothing else depends on `req.tenant`
   yet, the codebase returns to its exact prior state.

**Rollback safety guarantees:**
- No data was created or migrated → nothing to unwind in the database.
- No public API contract changed → no client needs to roll back.
- The reference consumer always has a legacy fallback → disabling the seam never
  breaks the one endpoint that reads it.

---

## 11. Definition of Done

P0 is **done** when all of the following hold:

1. **Seam exists:** a single `tenantContextMiddleware` resolves `req.tenant`
   once per authenticated request, wired in `app.ts` after auth and before
   routes, behind `TENANT_CONTEXT_ENABLED`.
2. **Superset proven:** tests T1–T4 show `req.tenant.businessId` equals today's
   `getOwnRestaurantId` result for every actor type (including `null`), and
   `role` equals `req.user.role`.
3. **Zero behavior change proven:** T5–T7 pass — public routes unaffected, flag
   off is a no-op, and the **entire existing suite passes unchanged with the
   flag on**.
4. **Robustness proven:** T8 (never throws) and T9 (single read/memoized) pass.
5. **Consumption proven:** exactly one existing handler reads
   `req.tenant.businessId` with identical output vs. the legacy path (T10),
   establishing the pattern for later phases.
6. **Reserved slots present:** `organizationId`, `locationId`, `memberships`,
   `capabilities` exist on `TenantContext` as empty/nullable defaults, ready for
   P1–P4 to populate — and are read by nothing in P0.
7. **No forbidden changes:** `git diff` shows **no** modification to
   `schema.prisma`, no new migration folder, no change to `lib/jwt.ts`, cookies,
   or `apps/web/**`.
8. **Terminology recorded:** `PROJECT_MEMORY.md` states "Business = tenant; new
   code reads `req.tenant.businessId`," and the source-of-truth hierarchy points
   to this spec for P0.
9. **Reversibility documented and verified:** the flag-off path is tested; each
   PR reverts cleanly.
10. **CI green:** lint, typecheck, test, build, and the migration-check job
    (which will confirm **no** schema change accompanied P0) all pass.

**Exit signal for the next phase:** with P0 done, **P1 (Organization layer)**
can begin — it will populate `TenantContext.organizationId` through the same
seam, with no new call-site churn. P0's success criterion is precisely that P1
needs to touch only the resolver, not the whole codebase.

---

*End of P0 Execution Specification. This document specifies work only; it
implements nothing. Implementation is authorized separately and must remain
additive, flag-guarded, schema-free, and behavior-preserving, exactly as
scoped here.*
