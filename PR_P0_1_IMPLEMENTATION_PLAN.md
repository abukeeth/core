# OrderVora — PR-P0.1 Implementation Plan
## `TenantContext` type + resolver (no wiring)

> **Document type:** Implementation plan for **PR-P0.1 only** (the first of the
> three P0 PRs). Scope-limited by request: **P0.2 and P0.3 are out of scope and
> not discussed here.**
> **Status:** Planning only. **No code is written in this document.** It reviews
> the repository, pins the exact files PR-P0.1 will touch, the proposed tree,
> each file's responsibilities, risks, and the validation strategy.
> **Source of authority:** `P0_EXECUTION_SPEC.md` → "PR-P0.1 — `TenantContext`
> type + resolver (no wiring)". Architecture: `BUSINESS_OS_FOUNDATION.md`.
> **Repository:** `abukeeth/core` @ branch
> `claude/ordervora-blueprint-gaps-kwyve1`. **Date:** 2026-07-19.

---

## 1. What PR-P0.1 is (and is not)

**PR-P0.1 delivers, per the spec:**
- The `TenantContext` interface (with P0-populated fields + reserved slots).
- The Express `Request` type augmentation adding an optional `req.tenant`.
- A **pure, unit-tested resolver** that computes `{ businessId, role }` from an
  authenticated user, using the same source of truth the app uses today
  (`User.restaurantId` via `getOwnRestaurantId`).
- The `TENANT_CONTEXT_ENABLED` config flag accessor (default **off**), unused.

**PR-P0.1 explicitly does NOT:**
- Wire anything into `app.ts` (that is P0.2 — out of scope).
- Attach `req.tenant` to any real request (no middleware mounted here).
- Read `req.tenant` from any controller (that is P0.3 — out of scope).
- Touch `schema.prisma`, migrations, `lib/jwt.ts`, cookies, or `apps/web`.

> **Net runtime effect of PR-P0.1 = zero.** It adds inert, importable,
> fully-tested building blocks. Nothing calls them yet, so it cannot change any
> behavior — which is exactly what makes it independently reviewable and
> trivially revertible.

---

## 2. Repository review — what PR-P0.1 must conform to

Findings from the current codebase that constrain the design:

1. **The scope source of truth already exists.**
   `getOwnRestaurantId(userId)` (`apps/api/src/modules/restaurants/restaurant.service.ts:44`)
   returns `User.restaurantId | null`. This is precisely today's answer to
   "which business is this user's?" — the resolver must reuse it so
   `businessId` is a strict superset, never a new scoping path.

2. **The JWT carries no restaurant id.**
   `AccessTokenPayload = { sub, role }` (`apps/api/src/lib/jwt.ts`). So
   `businessId` cannot come from the token; it must be resolved server-side
   (one DB read), confirming the reuse of `getOwnRestaurantId`.

3. **Express `Request` augmentation is co-located, not centralized.**
   Existing modules declare `declare global { namespace Express { interface
   Request { … } } }` **inside the module file** — see
   `middleware/require-auth.ts:6` (`user?`),
   `middleware/require-idempotency-key.ts:5`, and
   `commerce/customers/require-customer-auth.ts:7`. PR-P0.1 follows this exact
   convention rather than inventing a new global-types location.

4. **Config flags use `getStringEnv` / `getNumberEnv`, not the zod core schema.**
   `apps/api/src/config/env.ts` reserves the zod `coreEnvSchema` for
   boot-critical secrets (DATABASE_URL, JWT, encryption). Feature flags with a
   default use the narrow `getStringEnv(name, default)` accessor (as documented
   in the file's own header). There is **no `getBooleanEnv` yet** — PR-P0.1 will
   add a tiny, tested one (or read `getStringEnv("TENANT_CONTEXT_ENABLED",
   "false") === "true"`). This keeps the flag out of the boot-critical schema,
   so it can never block process start.

5. **Prisma is imported transitively by DB-free tests.**
   `lib/prisma.ts` deliberately uses non-throwing config so importing it in
   tests doesn't require a real DB. To keep the resolver **unit-testable without
   a database**, it must not hard-bind to Prisma; it takes its business-id
   lookup as an **injected dependency** (defaulting to `getOwnRestaurantId`).

6. **Test convention.** Tests are co-located `*.test.ts` (Vitest) beside the
   unit under test (166 API test files today). PR-P0.1's tests follow suit.

**Conclusion:** PR-P0.1 is a self-contained new module that *reuses* existing
primitives (`getOwnRestaurantId`, `Role`, the augmentation pattern, `getStringEnv`)
and introduces no new architectural surface.

---

## 3. Exact files touched by PR-P0.1

| # | Path | New / Edit | Purpose |
|---|---|---|---|
| 1 | `apps/api/src/modules/tenancy/tenant-context.ts` | **New** | `TenantContext` interface + `resolveTenantContext()` pure resolver + `req.tenant` Express augmentation. |
| 2 | `apps/api/src/modules/tenancy/tenant-context.test.ts` | **New** | Unit tests for the resolver (dependency-injected lookup; no DB). |
| 3 | `apps/api/src/config/env.ts` | **Edit (additive)** | Add `TENANT_CONTEXT_ENABLED` flag accessor (and, if chosen, a small `getBooleanEnv` helper). Default **off**. Not consumed yet. |
| 4 | `apps/api/src/config/env.test.ts` *(if it exists; else new)* | **New/Edit** | Test the flag accessor default + parsing. |

**Deliberately NOT touched in PR-P0.1:**
`apps/api/src/app.ts`, `middleware/require-auth.ts`, `middleware/require-role.ts`,
`modules/restaurants/restaurant.service.ts` (reused, not modified),
`apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/*`, `lib/jwt.ts`,
`lib/prisma.ts`, `apps/web/**`.

> **Design note (single-file vs split augmentation):** the spec sketched a
> separate `tenant-context.types.ts` for the Express augmentation. The repo's
> established convention (finding #3) is to co-locate the augmentation with the
> module. This plan therefore **keeps the augmentation inside
> `tenant-context.ts`**, matching `require-auth.ts`. A separate types file is an
> acceptable alternative but would diverge from the existing pattern — noted as
> a reviewer decision, defaulting to co-location.

---

## 4. Proposed file tree (after PR-P0.1)

```
apps/api/src/
├── config/
│   ├── env.ts                         (EDIT: + TENANT_CONTEXT_ENABLED flag,
│   │                                    + optional getBooleanEnv helper)
│   └── env.test.ts                    (NEW/EDIT: flag default + parsing tests)
│
├── modules/
│   └── tenancy/                       (NEW directory)
│       ├── tenant-context.ts          (NEW: interface + resolver + req.tenant augmentation)
│       └── tenant-context.test.ts     (NEW: pure unit tests, DB-free)
│
│   └── restaurants/
│       └── restaurant.service.ts      (UNCHANGED — getOwnRestaurantId reused as the default lookup)
│
├── middleware/
│   ├── require-auth.ts                (UNCHANGED — still the sole producer of req.user)
│   └── require-role.ts                (UNCHANGED)
│
├── lib/
│   ├── jwt.ts                         (UNCHANGED)
│   └── prisma.ts                      (UNCHANGED — not hard-bound; resolver uses injected lookup)
│
└── app.ts                            (UNCHANGED — no wiring in P0.1)
```

Only the `tenancy/` directory (2 files) and `config/env.ts` (+ its test) appear
in the diff. Everything else is shown to prove the boundary, not because it
changes.

---

## 5. Exact responsibilities of each file

### 5.1 `apps/api/src/modules/tenancy/tenant-context.ts` **(new)**
- **Declare `TenantContext`** with:
  - **P0-populated:** `businessId: string | null`, `role: Role | null`.
  - **Reserved (declared, empty/nullable, read by nothing in P0):**
    `organizationId: string | null`, `locationId: string | null`,
    `memberships: unknown[]` (typed loosely until P2), `capabilities` (empty
    placeholder until P3), and `resolvedFrom: "legacy-user-restaurant"`.
- **Augment Express `Request`** with `tenant?: TenantContext`, using the
  co-located `declare global { namespace Express { … } }` pattern (matching
  `require-auth.ts`).
- **Export `resolveTenantContext`** — a **pure, async** function:
  - Signature (conceptual): `resolveTenantContext(user: { id: string; role:
    Role } | undefined, deps?: { getBusinessIdForUser?: (userId: string) =>
    Promise<string | null> }) → Promise<TenantContext | undefined>`.
  - Behavior: if no `user` → returns `undefined` (public/unauthenticated). Else
    `businessId = await (deps.getBusinessIdForUser ?? getOwnRestaurantId)(user.id)`,
    `role = user.role`, reserved fields set to empty defaults, `resolvedFrom =
    "legacy-user-restaurant"`.
  - **Never throws** on the legacy path: wraps the lookup so a lookup error
    yields `businessId: null` (with a logged warning) rather than propagating.
  - **Dependency injection** of the lookup is what makes it unit-testable with
    no database (default binds to `getOwnRestaurantId`).
- **Does NOT** import Express app, mount middleware, or read the flag (wiring is
  P0.2). It may be a pure function only.

### 5.2 `apps/api/src/modules/tenancy/tenant-context.test.ts` **(new)**
- Unit-tests `resolveTenantContext` in isolation with an **injected** lookup
  (no DB, no Prisma):
  - Owner with a restaurant → `businessId` equals the injected value, `role`
    passthrough, `resolvedFrom` correct.
  - Staff → same, staff role.
  - No user (`undefined`) → returns `undefined`.
  - Lookup returns `null` (owner mid-onboarding) → `businessId: null`, no throw.
  - Lookup rejects (simulated error) → resolves to `businessId: null`, warning
    logged, **no throw**.
  - Reserved fields present and empty (`organizationId/locationId` null,
    `memberships` empty, etc.).
  - **Single invocation** of the lookup per call (spy asserts no N+1).

### 5.3 `apps/api/src/config/env.ts` **(edit, additive)**
- Add a **`TENANT_CONTEXT_ENABLED`** accessor via the existing non-core pattern
  (`getStringEnv("TENANT_CONTEXT_ENABLED", "false")` parsed to boolean), so it:
  - Defaults to **off** (safe; nothing consumes it in P0.1 anyway).
  - Stays **out of the zod core schema** → can never block process boot.
- Optionally add a tiny, tested **`getBooleanEnv(name, default)`** helper
  alongside `getStringEnv`/`getNumberEnv` for reuse in P0.2. (Reviewer choice;
  either the helper or an inline compare.)
- **No change** to `getEnv()` core schema, secrets, or existing accessors.

### 5.4 `apps/api/src/config/env.test.ts` **(new or edit)**
- Assert the flag defaults to `false` when unset, parses `"true"` → `true`, and
  any other value → `false`. If `getBooleanEnv` is added, test its default +
  parsing directly.

---

## 6. Risks (PR-P0.1 scope only)

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| R1 | **Type augmentation collision** — a second `declare global … Request` could conflict with existing `user?`/idempotency augmentations. | Low | Additive interface member only (`tenant?`); TypeScript merges declarations. Typecheck in CI catches any conflict. Follows the identical pattern already used 3× in the repo. |
| R2 | **Resolver coupled to Prisma → breaks DB-free tests.** | Low | Dependency-injected lookup (default `getOwnRestaurantId`); unit tests pass a fake, never importing Prisma. |
| R3 | **Import cycle** `tenancy → restaurants/restaurant.service → …`. | Low | The default lookup import is only pulled in at runtime call, not required for the type; tests inject their own. If a cycle appears, extract `getOwnRestaurantId`'s one-line query into a small shared helper (noted, not required). |
| R4 | **Flag leaks into the boot-critical schema** and blocks startup. | Very low | Use `getStringEnv`/`getBooleanEnv` (non-core), never the zod `coreEnvSchema`; default off. |
| R5 | **Scope drift from today's behavior** — `businessId` computed differently than `getOwnRestaurantId`. | Low | Resolver *is* `getOwnRestaurantId` by default; a test asserts equality to that function's output. |
| R6 | **Reserved fields over-typed too early** (e.g. importing a not-yet-existent `Membership`/`Capability` type). | Low | Keep reserved fields loosely typed (`unknown[]` / placeholder) in P0.1; tighten in P2/P3. No dependency on future entities. |
| R7 | **Dead-code lint failure** — the resolver/flag are unused in P0.1. | Low | They are **exported** (public API of the module), so they are not "unused" to the linter; tests also reference them. No `app.ts` import needed to satisfy lint. |

**Behavioral risk to existing users: none.** Nothing in this PR runs on a real
request path.

---

## 7. Validation strategy

### 7.1 Automated (must be green before merge)
1. **Unit tests** (`tenant-context.test.ts`) — all cases in §5.2 pass.
2. **Config tests** (`env.test.ts`) — flag default/parse (§5.4).
3. **Typecheck** — the `req.tenant` augmentation compiles and merges cleanly
   with existing `Request` augmentations.
4. **Lint** — clean; exported symbols are not flagged unused.
5. **Full existing suite unchanged** — all 166 API test files still pass with
   **zero modifications** (proves inertness).
6. **Build** — `apps/api` builds.
7. **CI migration-check** — confirms **no `schema.prisma` change** accompanies
   this PR (there is none), so the migration gate passes trivially.

### 7.2 Manual / review verification
- **Diff boundary check:** `git diff --name-only` shows **only**
  `modules/tenancy/*` and `config/env(.test).ts`. Any other path in the diff is
  a scope violation and must be removed.
- **Inertness check:** confirm `app.ts` is unchanged and nothing imports
  `tenant-context.ts` outside its own test — i.e., the resolver is genuinely
  unwired.
- **Superset spot-check:** a reviewer confirms the resolver's default path calls
  `getOwnRestaurantId`, so `businessId` equals today's value by construction.

### 7.3 Exit criteria for PR-P0.1 (Definition of Done, this PR only)
- `TenantContext` + `req.tenant` augmentation + pure `resolveTenantContext`
  exist and are unit-tested (DB-free).
- `TENANT_CONTEXT_ENABLED` flag exists, defaults off, lives outside the core
  schema, and is tested.
- Reserved slots (`organizationId`, `locationId`, `memberships`, `capabilities`,
  `resolvedFrom`) are present as empty/nullable and read by nothing.
- The diff touches only the four files in §3; `app.ts` and all existing
  behavior are untouched; the full suite passes unchanged.
- CI (lint, typecheck, test, build, migration-check) is green.
- The PR is revertible on its own with no data/schema implications.

> With PR-P0.1 merged, the building blocks exist and are proven, but nothing
> uses them yet. Mounting the resolver and attaching `req.tenant` to live
> requests is **PR-P0.2 — outside the scope of this plan.**

---

*End of PR-P0.1 implementation plan. Planning only; no code is written here.
Implementation is authorized separately and must remain additive, unwired,
schema-free, and behavior-preserving, exactly as scoped above.*
