# OrderVora — PR-P0.2 Implementation Plan
## Wire the Tenant Context resolver middleware (flag-guarded)

> **Document type:** Implementation plan for **PR-P0.2 only** (the second of the
> three P0 PRs). Scope-limited by request: **P0.3 and P1 are out of scope and
> not discussed here.**
> **Status:** Planning only. **No code is written in this document.** It reviews
> the repository and pins the exact files, the middleware mounting strategy, the
> flag usage, the request-lifecycle impact, risks, validation, acceptance
> criteria, and rollback for PR-P0.2.
> **Prerequisite:** **PR-P0.1 is merged to `main`** — `TenantContext`,
> `resolveTenantContext()`, the `req.tenant` augmentation, and
> `isTenantContextEnabled()` (`TENANT_CONTEXT_ENABLED`, default off) already
> exist and are tested.
> **Sources:** `P0_EXECUTION_SPEC.md` → "PR-P0.2 — Wire the resolver middleware
> (flagged on in non-prod)"; `MASTER_EXECUTION_SEQUENCE.md` (Part A / P0).
> **Repository:** `abukeeth/core` @ branch
> `claude/ordervora-blueprint-gaps-kwyve1` (restarted from merged `main`).
> **Date:** 2026-07-19.

---

## 1. What PR-P0.2 is (and is not)

**PR-P0.2 delivers, per the spec:**
- An Express **middleware** that, when the flag is on, attaches `req.tenant`
  (via the already-merged `resolveTenantContext()`) to requests that carry a
  valid authenticated session.
- The **wiring** of that middleware into `createApp()` in `app.ts`.
- **Integration/middleware tests** proving `req.tenant.businessId` equals
  `getOwnRestaurantId(user)` across owner / staff / admin / no-restaurant cases,
  and that public/unauthenticated requests get no `req.tenant`.

**PR-P0.2 explicitly does NOT:**
- Make any controller **read** `req.tenant` (that is P0.3 — out of scope).
- Change `requireAuth`, `requireRole`, JWT contents, or cookies.
- Touch `schema.prisma`, migrations, or `apps/web`.
- Change the `TenantContext` shape or the resolver logic (both merged in P0.1).
- Add or change the feature flag (`isTenantContextEnabled()` already exists).

> **Consumer count after PR-P0.2 = zero.** The middleware *produces* `req.tenant`
> but nothing *reads* it yet. Combined with the flag defaulting off, this keeps
> the PR low-risk and reversible.

---

## 2. Repository review — the decisive constraint

The single most important finding governing this PR:

> **`requireAuth` is applied _per route_, not globally.** There is **no
> `app.use(requireAuth)`** and no router-level `.use(requireAuth)`. Every
> protected route lists it inline as the first handler, e.g.
> `ordersRouter.get("/me/orders", requireAuth, staffOrOwner, …)`
> (`commerce/orders/orders.routes.ts:28`). `requireAuth` is the sole producer of
> `req.user`, and it only runs **inside** a router, **after** any global
> app-level middleware.

**Consequence for the mount strategy:** the spec's conceptual ordering
(`cookieParser → auth → tenantContextMiddleware → routers`) cannot be taken
literally, because there is no global auth step before the routers. A global
middleware mounted before the routers would run **before** any per-route
`requireAuth`, so `req.user` would not yet be populated.

**Resolution (design decision for PR-P0.2):** mount a **global, token-aware,
non-enforcing** middleware immediately after `cookieParser()`. It reuses the
exact primitives `requireAuth` uses — `ACCESS_TOKEN_COOKIE`
(`modules/auth/cookies.ts:3`) and `verifyAccessToken` (`lib/jwt.ts:27`) — to
read (not gate) the session: if a valid access token is present, it resolves and
attaches `req.tenant`; otherwise it is a silent no-op. This achieves the spec's
intent — `req.tenant` available to authenticated handlers, nothing for public
requests — with a single mount point, **without modifying the security-critical
`requireAuth` path** and **without enforcing anything** (real gating stays
exactly where it is today, per-route).

Supporting facts verified:
- `createApp()` is the assembly point (`app.ts:144`); `cookieParser()` is at
  `app.ts:215`; routers mount from `app.ts:275+`.
- `supertest` is a dev dependency already used in `app.test.ts` → integration
  tests are straightforward.
- `resolveTenantContext(user, deps?)` (merged P0.1) is pure, async,
  dependency-injected, and never throws — the middleware wraps it.

---

## 3. Files to change

| # | Path | New / Edit | Purpose |
|---|---|---|---|
| 1 | `apps/api/src/modules/tenancy/tenant-context.middleware.ts` | **New** | The Express middleware: flag check → read/verify the access-token cookie (reusing `ACCESS_TOKEN_COOKIE` + `verifyAccessToken`) → on success call `resolveTenantContext({ id: sub, role })` and attach `req.tenant` → `next()`. Never throws; never blocks. |
| 2 | `apps/api/src/modules/tenancy/tenant-context.middleware.test.ts` | **New** | Middleware unit tests (mocked verify/resolver) + supertest integration tests asserting `req.tenant` presence/values via a tiny probe route or an existing authenticated route. |
| 3 | `apps/api/src/app.ts` | **Edit (additive, ~1–2 lines)** | Import and `app.use(...)` the middleware once, immediately after `cookieParser()` (line ~215), before `siteEdgeMiddleware`/routers. |

**Deliberately NOT touched in PR-P0.2:**
`modules/tenancy/tenant-context.ts` (merged, unchanged), `config/env.ts` (flag
already exists), `middleware/require-auth.ts`, `middleware/require-role.ts`,
`lib/jwt.ts`, `modules/auth/cookies.ts` (imported, not modified),
`apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/*`, `apps/web/**`.

### Proposed file tree (delta only)
```
apps/api/src/
├── app.ts                                   (EDIT: +import, +one app.use after cookieParser)
└── modules/tenancy/
    ├── tenant-context.ts                    (UNCHANGED — merged in P0.1)
    ├── tenant-context.test.ts               (UNCHANGED — merged in P0.1)
    ├── tenant-context.middleware.ts         (NEW)
    └── tenant-context.middleware.test.ts    (NEW)
```

---

## 4. Middleware mounting strategy

### 4.1 Placement
- Mount **once, globally**, in `createApp()` **immediately after
  `app.use(cookieParser())`** (`app.ts:215`) and **before** `siteEdgeMiddleware`
  and all routers (`app.ts:275+`). Rationale: the cookie must be parsed first
  (the middleware reads the access-token cookie); placing it before the routers
  guarantees `req.tenant` is populated by the time any handler runs.

### 4.2 Behavior (token-aware, non-enforcing)
The middleware performs, in order:
1. **Flag gate:** if `isTenantContextEnabled()` is false → `next()` immediately.
   Zero work, zero `req.tenant`. (See §5.)
2. **Read session:** read `req.cookies[ACCESS_TOKEN_COOKIE]`. If absent →
   `next()` (public/unauthenticated request; no `req.tenant`).
3. **Verify (read-only):** `verifyAccessToken(token)` inside a try/catch. On any
   error (expired/invalid) → log at debug and `next()` **without** `req.tenant`.
   It must **never** reject a request the way `requireAuth` would — this
   middleware does not gate access.
4. **Resolve:** call `resolveTenantContext({ id: payload.sub, role:
   payload.role })`, which itself never throws. Attach the result to
   `req.tenant`.
5. `next()`.

### 4.3 Why not modify `requireAuth` (rejected alternative)
Folding resolution into `requireAuth` would place it exactly "after `req.user`,"
but it would (a) touch the security-critical auth path, (b) make `requireAuth`
async, and (c) run resolution on the same code path as gating, coupling two
concerns. The global non-enforcing resolver is **more reversible** (remove one
`app.use` line) and **safer** (auth logic untouched). This is the recommended
strategy; the alternative is documented only to record that it was considered.

### 4.4 Idempotency & correlation
- The middleware is a pure producer; running it once per request is sufficient.
  If `req.tenant` is already set (it won't be in P0.2), it must not overwrite.
- Optional, additive: it *may* also feed the existing request-correlation logger
  (`setRequestRestaurantId`, `lib/logger.ts`) with the resolved `businessId` —
  **out of scope for P0.2 unless trivial**; noted, not required.

---

## 5. Feature flag usage

- **Flag:** `TENANT_CONTEXT_ENABLED`, read via the already-merged
  `isTenantContextEnabled()` (default **off**, non-core schema so it can never
  block boot).
- **Where checked:** the **first line** of the middleware. Flag off → the
  middleware is an immediate pass-through, so mounting it is inert until the flag
  is deliberately set. This means the `app.ts` wiring can merge safely with the
  flag off in every environment.
- **Rollout posture (per spec):** flag **on in dev/staging**, **staged
  off→on in production** only after the integration tests and a staging soak
  confirm no behavior change. PR-P0.2 does **not** turn the flag on in
  production.
- **No new flag introduced** — this PR only *consumes* the P0.1 flag.

---

## 6. Request lifecycle impact

**Flag OFF (default, and all of production at merge time):**
- The middleware runs but returns immediately. Net effect on every request:
  one boolean check. `req.tenant` is never set. **Behavior is identical to
  today.**

**Flag ON (dev/staging):**
- **Authenticated request** (valid access-token cookie): one `verifyAccessToken`
  (cheap, same verify `requireAuth` does per-route) + one indexed
  `User.restaurantId` lookup (the same read `getOwnRestaurantId` does today),
  memoized once per request. `req.tenant` is attached. **No handler reads it in
  P0.2**, so responses and access control are unchanged.
- **Public/unauthenticated request** (`/store`, `/preview`, `/api/public/*`,
  webhooks, or any request without the cookie): the cookie is absent or invalid
  → `next()` with no `req.tenant`. **No impact.**
- **Never blocks:** because the middleware does not enforce, a request that
  succeeds today cannot fail because of it — even with a malformed/expired token
  (that path just yields no `req.tenant`; the per-route `requireAuth` still
  returns 401 as before).

**Performance note (documented, accepted):** with the flag on, authenticated
requests incur one extra JWT verify + one extra PK lookup even though nothing
consumes `req.tenant` yet. This is intentional simplicity for P0.2; it only
occurs where the flag is enabled (not prod at merge), mirrors work services
already do, and is memoized per request. A lazy-resolution optimization is
possible later but is **not** part of P0.2.

---

## 7. Risks

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| R1 | **Mount-point assumes global auth** — placing the middleware expecting `req.user` would yield null everywhere (because `requireAuth` is per-route). | Medium (design trap) | Resolved by design: the middleware is **token-aware/self-verifying**, not dependent on `req.user`. This is the core §2/§4 decision. |
| R2 | **Middleware blocks or errors a currently-passing request.** | Low | Non-enforcing by contract: every failure path (`no cookie`, `verify throws`, `resolver`) ends in `next()` with no `req.tenant`. Tests assert public + bad-token requests are unaffected. |
| R3 | **Runs on public/storefront routes** (mounted globally). | Low | Intended and harmless: no valid owner token → no `req.tenant`. Explicit test on a public route. |
| R4 | **Double JWT verify** (middleware + per-route `requireAuth`). | Low | Accepted; JWT verify is cheap and only when flag on. Reuses the same `verifyAccessToken`, so no logic divergence. |
| R5 | **Extra DB read per authenticated request with no consumer yet.** | Low | Only when flag on (not prod at merge); one memoized indexed PK lookup mirroring existing service behavior; documented in §6. |
| R6 | **Accidental enforcement/overwrite** — future confusion that this gates auth. | Low | Code + tests make non-enforcement explicit; does not overwrite an existing `req.tenant`. |
| R7 | **`app.ts` merge/order regression** (placed before `cookieParser`, so no cookies). | Low | Placement is pinned to *immediately after* `cookieParser()`; a test asserts `req.tenant` is populated (cookie was parsed) on an authenticated request. |

**Behavioral risk to existing users with the flag off: none.**

---

## 8. Validation strategy

### 8.1 Automated (must be green before merge)
1. **Middleware unit tests** (`tenant-context.middleware.test.ts`):
   - Flag off → `next()` called, `req.tenant` undefined, no verify/resolve.
   - No cookie → `next()`, no `req.tenant`.
   - Invalid/expired token → `next()`, no `req.tenant`, never throws/blocks.
   - Valid token → `resolveTenantContext` called with `{ id: sub, role }`,
     `req.tenant` attached.
2. **Integration tests (supertest, flag on)** — using an existing authenticated
   route (or a minimal test-only probe) that echoes `req.tenant`:
   - **Owner:** `req.tenant.businessId === getOwnRestaurantId(owner.id)`,
     `role === RESTAURANT_OWNER`.
   - **Staff:** business id matches, `role === RESTAURANT_STAFF`.
   - **Admin:** `role === ADMIN`, businessId per today's rules.
   - **Owner with no restaurant:** `businessId === null`, request still 2xx.
   - **Public route / no cookie:** no `req.tenant`; response identical to
     baseline.
3. **Flag-off inertness:** the entire existing suite passes with the middleware
   mounted and the flag **off** — proving the wiring changes nothing by default.
4. **Flag-on inertness:** the existing suite also passes with the flag **on**
   (nothing reads `req.tenant`, so producing it changes no behavior).
5. **Lint, typecheck, build** clean.
6. **CI migration-check** trivially passes — no `schema.prisma` change.

### 8.2 Manual / review verification
- **Diff boundary:** `git diff --name-only` shows only the two new
  `tenant-context.middleware*` files and `app.ts`.
- **Mount check:** the `app.use(...)` sits immediately after `cookieParser()`,
  before routers.
- **Non-enforcement check:** confirm every branch ends in `next()`.

---

## 9. Acceptance criteria (PR-P0.2 only)

1. A global, flag-guarded, **non-enforcing** middleware is mounted once in
   `createApp()` right after `cookieParser()`.
2. **Flag off:** `req.tenant` is never set; the full existing suite passes
   unchanged (default behavior identical to today).
3. **Flag on:** authenticated requests carry `req.tenant` with
   `businessId === getOwnRestaurantId(user)` and `role === req.user.role`,
   proven for owner/staff/admin/no-restaurant (integration tests).
4. **Public/unauthenticated requests** never receive `req.tenant`, and no
   request that succeeds today fails because of the middleware (bad/expired
   token → no `req.tenant`, not an error).
5. `requireAuth`/`requireRole`/JWT/cookies are **unchanged**; no controller
   reads `req.tenant` yet.
6. Diff touches only the two new middleware files + `app.ts`; no schema,
   migration, or web change.
7. CI green: lint, typecheck, test, build, migration-check.
8. The PR is revertible on its own with no data/schema implications.

---

## 10. Rollback plan

Three independent, instantaneous levers — none involve data or schema:

1. **Flag rollback (no deploy):** ensure/keep `TENANT_CONTEXT_ENABLED` off (its
   default). The mounted middleware becomes an immediate pass-through; `req.tenant`
   is never produced. This is the primary, zero-risk control and is the state at
   merge time in production.
2. **Revert the `app.ts` wiring (one hunk):** remove the single `app.use(...)`
   line + import. The middleware is no longer in the chain; the new files become
   dead but harmless (nothing imports them).
3. **Full-PR revert:** revert the commit to remove both new files and the
   wiring; because nothing reads `req.tenant` and the resolver/flag from P0.1 are
   independent, the codebase returns to the merged-P0.1 state exactly.

**Why rollback is safe:** no schema/migration/data changes; the middleware is
non-enforcing (removing it cannot expose or block anything that per-route
`requireAuth` wasn't already controlling); and there are no consumers of
`req.tenant` to break.

> With PR-P0.2 merged (flag off in prod), the seam is wired and provably inert.
> Making a controller actually **read** `req.tenant` is **PR-P0.3 — outside the
> scope of this plan.**

---

*End of PR-P0.2 implementation plan. Planning only; no code is written here.
Implementation is authorized separately and must remain additive, flag-guarded,
non-enforcing, schema-free, and behavior-preserving, exactly as scoped above.*
