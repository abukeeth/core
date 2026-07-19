# OrderVora — PR-P0.3 Implementation Plan
## First real consumer of `req.tenant` (proof-of-consumption)

> **Document type:** Implementation plan for **PR-P0.3 only** (the third and
> final P0 PR). Scope-limited by request: **P1, Organization, and Memberships
> are out of scope and not discussed here.**
> **Status:** Planning only. **No code is written in this document.** It reviews
> the repository and pins the exact consumer, why it is the safest, the files to
> change, the validation strategy, the rollback plan, and acceptance criteria.
> **Prerequisites (both merged):** PR-P0.1 (the `TenantContext` type +
> `resolveTenantContext()` + `req.tenant` augmentation + `isTenantContextEnabled()`)
> and PR-P0.2 (the flag-guarded middleware that attaches `req.tenant`).
> **Sources:** `P0_EXECUTION_SPEC.md` → "PR-P0.3 — Terminology adoption + one
> reference consumer"; `MASTER_EXECUTION_SEQUENCE.md` (Part A / P0).
> **Repository:** `abukeeth/core` @ branch
> `claude/ordervora-blueprint-gaps-kwyve1`. **Date:** 2026-07-19.

---

## 1. Goal of PR-P0.3

- Introduce the **first real consumer** of `req.tenant` — one endpoint that
  actually reads `req.tenant.businessId` to drive its behavior.
- **Prove the Tenant Context works end-to-end**: cookie → P0.2 middleware →
  `req.tenant` → a controller that uses it → identical response.
- **Keep behavior identical** in every case (flag on or off).
- **Minimize risk**: touch exactly one read-only, owner-scoped endpoint, behind
  the same flag, with a legacy fallback.

> After PR-P0.3, P0 is complete: the seam is defined (P0.1), wired (P0.2), and
> proven by a live consumer (P0.3) — with production still safe because the flag
> defaults off and the fallback guarantees identical output when on.

---

## 2. Exact controller / service / route to modify

**The safest first consumer: `GET /api/restaurants/me` → `getMine`.**

- **Route:** `restaurantRouter.get("/me", requireAuth, requireRole(RESTAURANT_OWNER, RESTAURANT_STAFF), getMine)`
  (`apps/api/src/modules/restaurants/restaurant.routes.ts`).
- **Controller:** `getMine` (`apps/api/src/modules/restaurants/restaurant.controller.ts:48`).
- **Service today:** `getMine` calls `getOwnRestaurant(req.user!.id)`
  (`restaurant.service.ts:123`), which is exactly:
  1. `getOwnRestaurantId(userId)` → the user's `restaurantId` (or throw
     `NoRestaurantError`), **then**
  2. `prisma.restaurant.findUnique({ where: { id } })` (or throw
     `NoRestaurantError`).

**The change (conceptual, no code here):** make `getMine` obtain the business id
from `req.tenant` when it is present, falling back to the legacy per-user
resolution otherwise:

```
businessId = req.tenant ? req.tenant.businessId : <legacy getOwnRestaurantId(req.user!.id)>
if (!businessId) → NoRestaurantError (404, unchanged)
restaurant = <fetch by businessId>   // the same findUnique step getOwnRestaurant already does
```

- **Flag OFF (default):** `req.tenant` is undefined → the legacy path runs →
  **byte-for-byte identical to today.**
- **Flag ON:** `req.tenant.businessId` is used, and it is defined to equal
  `getOwnRestaurantId(userId)` (proven in P0.1/P0.2) → **same id, same fetch,
  same response.**
- **No-restaurant case:** both paths yield `null` → `NoRestaurantError` → the
  same 404, in both flag states.

This makes `getMine` a genuine consumer (its resolution is driven by
`req.tenant` when present) while the fallback + the businessId-equivalence make
the output provably identical.

---

## 3. Why `getMine` is the safest consumer

1. **Read-only.** It performs no writes, no side effects, no external calls — a
   wrong resolution could at worst return a 404 or a different-but-owned
   restaurant, and the equivalence guarantee rules even that out. Contrast with
   `updateMine`/`setSetupStepHandler` (writes) — deliberately avoided.
2. **Already resolves "the user's own business."** `getMine`'s entire job is to
   map the authenticated user to their single restaurant — precisely what
   `req.tenant.businessId` encodes. The consumer is a *substitution of the
   resolution source*, not a new behavior.
3. **Owner/staff-scoped and self-referential.** The endpoint only ever returns
   the caller's own restaurant; there is no cross-tenant surface to get wrong.
4. **Exact equivalence exists and is tested.** `req.tenant.businessId` is
   defined as `getOwnRestaurantId(userId)` and proven equal in P0.1 (resolver)
   and P0.2 (middleware) tests — so "identical output" is not hoped-for, it is
   structurally guaranteed.
5. **Benign, well-defined failure mode.** The only error path is
   `NoRestaurantError → 404`, already handled by the controller, identical in
   both flag states.
6. **Existing test coverage.** `GET /me` / `getMine` already has tests to anchor
   "no regression," which the PR extends to both flag states.
7. **Same-cookie consistency.** The P0.2 middleware resolves `req.tenant` from
   the access-token cookie; `requireAuth` resolves `req.user` from the same
   cookie. They therefore always agree on the user, so `req.tenant.businessId`
   corresponds to `req.user.id` — no risk of the two disagreeing.

**Rejected alternatives (and why):** `updateMine` / `setSetupStepHandler`
(writes — higher blast radius); `getOwnReferrals` (read-only but a niche path
with less direct "return my restaurant" semantics); any commerce/orders/
payments endpoint (broader, higher-value surfaces — never the place for a first
proof). `getMine` is the smallest, safest, most self-contained real consumer.

---

## 4. Files to change

| # | Path | New / Edit | Purpose |
|---|---|---|---|
| 1 | `apps/api/src/modules/restaurants/restaurant.controller.ts` | **Edit** | `getMine` reads `req.tenant?.businessId` (with legacy fallback) to resolve the business id, then fetches by id. Only `getMine` changes; other handlers untouched. |
| 2 | `apps/api/src/modules/restaurants/restaurant.service.ts` | **Edit (additive)** | Add a small read-only helper `getRestaurantByBusinessId(businessId)` — the second half of the existing `getOwnRestaurant` (a `findUnique` + `NoRestaurantError`). Additive; `getOwnRestaurant` may optionally be refactored to call it, or left as-is to minimize blast radius. |
| 3 | `apps/api/src/modules/restaurants/restaurant.controller.test.ts` *(and/or `restaurant.service.test.ts`)* | **Edit/New** | Tests proving identical output with the flag **off** (legacy) and **on** (tenant-driven), plus the no-restaurant 404 in both states. |

**Deliberately NOT touched in PR-P0.3:**
`modules/tenancy/*` (P0.1/P0.2 code, unchanged), `app.ts` (middleware already
wired), `config/env.ts` (flag exists), `middleware/require-auth.ts`,
`require-role.ts`, `lib/jwt.ts`, any other controller/route/module,
`apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/*`, `apps/web/**`.

> **Scope discipline:** exactly one endpoint (`getMine`) becomes a consumer.
> This PR does not migrate any other call site off `getOwnRestaurantId`; the
> broader adoption is future work, out of P0.3 scope.

---

## 5. Validation strategy

### 5.1 Automated (must be green before merge)
1. **Controller/service unit tests — flag OFF (default):** `getMine` returns the
   caller's restaurant exactly as today (legacy path), and returns 404 when the
   user has no restaurant. `req.tenant` is undefined in these tests.
2. **Controller/service unit tests — flag ON:** with a populated `req.tenant`
   (businessId = the caller's restaurant id), `getMine` returns the **same**
   restaurant object it returns on the legacy path — asserted on identical
   fixtures. With `req.tenant.businessId = null` (owner mid-onboarding),
   `getMine` returns the same 404 as the legacy path.
3. **Equivalence assertion:** a test that the flag-on and flag-off code paths
   produce identical responses for the same seeded user (the core
   proof-of-consumption).
4. **Existing `getMine` / restaurant tests pass unchanged** — proving no
   regression to the endpoint's current contract.
5. **Full existing API suite passes** with the flag off (default) — proving the
   change is inert by default — and with the flag on (nothing else reads
   `req.tenant`, and `getMine`'s output is unchanged).
6. **Lint, typecheck, build** clean; **CI migration-check** trivially green (no
   `schema.prisma` change).

### 5.2 End-to-end proof (the point of P0.3)
- With the flag **on**, an integration-style test drives `GET /api/restaurants/me`
  with a valid owner session and asserts the response equals the flag-off
  baseline — demonstrating the value flowed cookie → P0.2 middleware →
  `req.tenant` → `getMine` → response. (If an existing DB-backed test harness is
  used, follow the repo's existing restaurant-test setup; otherwise assert at
  the controller-unit level with a stubbed `req.tenant`, mirroring the P0.2
  test approach.)

### 5.3 Manual / review verification
- **Diff boundary:** only `restaurant.controller.ts`, `restaurant.service.ts`,
  and the restaurant test file(s) appear in the diff.
- **Single-consumer check:** `getMine` is the only handler that reads
  `req.tenant`; no other call site changed.
- **Fallback check:** confirm the flag-off / `req.tenant`-absent path is exactly
  the pre-P0.3 behavior.

---

## 6. Rollback plan

Three independent, instantaneous levers — none involve data or schema:

1. **Flag rollback (no deploy):** keep/return `TENANT_CONTEXT_ENABLED` to off
   (its default). `req.tenant` is never populated (P0.2 is inert), so `getMine`
   takes the legacy fallback — **exact pre-P0.3 behavior**. This is the primary
   control and the production state at merge.
2. **Revert the `getMine` edit (one handler):** restore `getMine` to call
   `getOwnRestaurant(req.user!.id)`; the additive `getRestaurantByBusinessId`
   helper becomes unused but harmless.
3. **Full-PR revert:** revert the commit to remove the consumer and the helper;
   because P0.1/P0.2 are independent and nothing else reads `req.tenant`, the
   codebase returns to the merged-P0.2 state exactly.

**Why rollback is safe:** no schema/migration/data changes; the consumer has a
legacy fallback that is byte-for-byte today's behavior; and the endpoint is
read-only, so no reversal of side effects is ever required.

---

## 7. Acceptance criteria (PR-P0.3 only)

1. `getMine` (`GET /api/restaurants/me`) reads `req.tenant.businessId` to resolve
   the business id **when present**, and falls back to the legacy
   `getOwnRestaurantId(req.user!.id)` resolution otherwise.
2. **Flag OFF:** `getMine`'s behavior and response are byte-for-byte identical to
   pre-P0.3 (legacy path); the full existing suite passes unchanged.
3. **Flag ON:** `getMine` returns the **same** restaurant (and the same 404 for a
   user with no restaurant) as the flag-off path — proven by tests on identical
   fixtures.
4. The value is demonstrably consumed end-to-end (cookie → P0.2 middleware →
   `req.tenant` → `getMine`), establishing that Tenant Context works.
5. Exactly one endpoint is a consumer; no other call site is migrated; no write
   endpoint is touched.
6. Diff is limited to `restaurant.controller.ts`, `restaurant.service.ts`
   (additive helper), and the restaurant test file(s). No schema, migration,
   JWT, `requireAuth`, tenancy-module, `app.ts`, or web change.
7. Lint, typecheck, tests, build, and migration-check are all green.
8. The change is additive and fully reversible (flag, per-handler revert, or
   full-PR revert).

> With PR-P0.3 merged (flag off in prod), P0 is complete and proven: the Tenant
> Context seam is defined, wired, and consumed by one safe endpoint, with zero
> behavior change and full reversibility.

---

*End of PR-P0.3 implementation plan. Planning only; no code is written here.
Implementation is authorized separately and must remain additive, flag-guarded,
behavior-preserving, and limited to the single `getMine` consumer, exactly as
scoped above.*
