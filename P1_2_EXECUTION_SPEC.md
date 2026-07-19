# OrderVora — P1.2 Execution Specification
## Organization backfill + createRestaurant integration

> **Document type:** Executable specification for **BOS Phase 1, PR-P1.2**.
> Governance-level; makes P1.2 ready to implement.
> **Scope:** **Documentation only.** No code, no PR. Actual code/migration is
> authorized separately. **P1.2 changes no `schema.prisma` DDL** — the
> `Organization` table and nullable `Restaurant.organizationId` already exist
> (P1.1). P1.2 is **data + one service integration**.
> **Prime directive:** **Additive, backward-compatible, reversible.** The
> `Restaurant`/`restaurantId` engine keeps working; `organizationId` stays
> nullable and is still read by nothing until P1.3.
> **Sources:** `P1_ORGANIZATION_EXECUTION_SPEC.md` (Phase P1),
> `BUSINESS_OS_IMPLEMENTATION_PLAN.md` (P1), `MASTER_EXECUTION_SEQUENCE.md`.
> **Repository:** `abukeeth/core` @ `main` `8a81c1e` (after PR #20 / P1.1 merged).
> **Date:** 2026-07-19.

---

## 1. Current state after P1.1 (verified on `main`)

- **`Organization` entity exists** (`id`, `name`, `ownerUserId → User`,
  `businesses Restaurant[]`, `@@index([ownerUserId])`); the table is **empty**.
- **`Restaurant.organizationId` is a NULLABLE FK** to `Organization`
  (`@@index([organizationId])`), currently `NULL` for every row.
- **`organization.service.ts`** exists with `createOrganization` and
  `getOrganizationById` — **wired nowhere** (inert).
- **`createRestaurant`** (`restaurant.service.ts`) already runs inside a
  `prisma.$transaction`: it calls `createWithUniqueReferralCode(tx, {...})` to
  create the Restaurant, then `tx.user.update` to set `user.restaurantId`, then
  (outside the tx) `bestEffort(ensureOnboardingStatus)`. It guards 1:1 ownership
  via `getOwnRestaurantId` → `RestaurantAlreadyExistsError`.
- **`Restaurant.ownerId @unique`** still enforces 1:1 owner↔restaurant — the key
  the backfill relies on for unambiguous mapping.
- **Resolver** still returns `organizationId: null` (P1.3 not started).

**What P1.2 must achieve:** every Business — existing *and* newly created — ends
up with exactly one Organization (`ownerUserId == ownerId`), establishing the
1:1:1 invariant, **without** changing any observable behavior.

---

## 2. Objectives

1. **New businesses:** make `createRestaurant` create and link exactly one
   Organization **inside its existing transaction**, atomically with the
   Restaurant and the `user.restaurantId` link.
2. **Existing businesses:** back-fill exactly one Organization per Restaurant
   whose `organizationId` is `NULL`, and set the link — **idempotently**.
3. **Establish the invariant:** after P1.2, every Restaurant has a non-null
   `organizationId` and every Organization has exactly one Business, owned by
   the same User. (`organizationId` stays **nullable** in the schema — no
   `NOT NULL` in P1.)
4. **Change nothing observable:** no endpoint response, status, authorization,
   or UI change; the resolver still returns `organizationId: null`; the full
   suite passes.

**Explicit non-objectives (guardrails):** no Membership/roles, no billing, no
Location, no `NOT NULL`, no `ownerId` change, no UI change, no authorization
change, no multi-business behavior.

---

## 3. Repository impact

| Area | Path | Nature of change |
|---|---|---|
| Business creation | `apps/api/src/modules/restaurants/restaurant.service.ts` | Extend the existing `createRestaurant` `$transaction` to create+link an Organization. |
| Backfill (data migration) | `apps/api/prisma/migrations/<ts>_p1_2_backfill_organizations/migration.sql` | New **data-only** migration (DML), no DDL. Auto-runs via `prisma migrate deploy`. |
| Tests | `restaurant.service.test.ts` (+ a backfill verification test) | Assert org created+linked atomically; assert backfill idempotency/parity. |
| (Optional) service reuse | `apps/api/src/modules/organizations/organization.service.ts` | May add a **tx-aware** create helper if preferred; otherwise `createRestaurant` calls `tx.organization.create` directly (the existing `createOrganization` uses the global `prisma`, not `tx`, so it is **not** transaction-safe to reuse inside the tx). |

**Not touched in P1.2:** `schema.prisma` (no DDL), `lib/jwt.ts`,
`require-auth.ts`, `require-role.ts`, `apps/web/**`, the tenancy
middleware/resolver (`tenant-context.ts`), `app.ts`, `config/env.ts`.

**Seed scripts note:** `prisma/seed.ts` / `seed-beta.ts` create `Restaurant`
rows directly (not via `createRestaurant`). Those rows will have
`organizationId = NULL` unless updated. This is **acceptable for P1.2** (nothing
reads `organizationId` yet), but should be revisited before **P1.3** so seeded
environments satisfy the invariant. Options: route seeds through
`createRestaurant`, set `organizationId` in the seed, or re-run the backfill
after seeding. **Flag for P1.3, not required in P1.2.**

---

## 4. Migration strategy (data-only, idempotent, auto-applied)

P1.2's backfill is a **data-only Prisma migration** (DML, no schema change), so
it runs automatically and exactly once per environment via `prisma migrate
deploy` (tracked in `_prisma_migrations`), and is transactional. Because P1.1
left the `Organization` table empty, the mapping from Business → new
Organization is unambiguous via the unique `ownerId`.

**Two statements, both guarded by `organizationId IS NULL` (idempotent):**

1. **Create one Organization per un-orged Business:**
   insert into `Organization` (`gen_random_uuid()`, `name = Restaurant.name`,
   `ownerUserId = Restaurant.ownerId`, timestamps) for every `Restaurant` where
   `organizationId IS NULL`.
2. **Link each Business to its Organization:**
   update `Restaurant.organizationId` from the `Organization` whose
   `ownerUserId` equals the Restaurant's `ownerId`, only where
   `Restaurant.organizationId IS NULL`.

**Why this is safe & idempotent:**
- `gen_random_uuid()` is built into Postgres 13+ (CI runs Postgres 16).
- `Restaurant.ownerId @unique` guarantees a 1:1 mapping in step 2 — no
  mis-linking is possible, because at backfill time each owner has exactly one
  (new) Organization.
- Both steps are `WHERE organizationId IS NULL` guarded, so a manual re-run (or
  a business created with an org after step 1) is a no-op for already-linked
  rows. A migration is tracked and runs once anyway.
- Runs inside the migration's transaction → all-or-nothing.

**Ordering requirement (deploy safety):** ship **PR-P1.2a (createRestaurant
integration) before PR-P1.2b (backfill)**. Once new businesses always get an
Organization, any Business created during/after the deploy already has one, so
the backfill closes the *pre-existing* gap with no race window. (If backfill
shipped first, a business created by old code between the backfill scan and the
integration deploy could slip through with a null org.)

**Migration-check CI:** P1.2 changes no `schema.prisma`, so the schema-change
gate does not fire; a DML-only migration leaves the schema-vs-migrations diff
empty (no drift). ✔

---

## 5. Transaction design (new-business path)

Extend the **existing** `createRestaurant` transaction so Organization creation
is atomic with the Restaurant and the owner link. Conceptually:

```
guard: getOwnRestaurantId(ownerId) — unchanged (RestaurantAlreadyExistsError)

prisma.$transaction(tx =>
    businessName = name ?? "My Business"          # single source for both records
    organization = tx.organization.create({ name: businessName, ownerUserId: ownerId })
    restaurant   = createWithUniqueReferralCode(tx, {
                     ownerId, name: businessName, ...rest,
                     setupStep: "BUSINESS_INFO",
                     referredById: referrer?.id,
                     organizationId: organization.id      # NEW — link at creation
                   })
    tx.user.update({ where: { id: ownerId }, restaurantId: restaurant.id })  # unchanged
    return restaurant
)
bestEffort(ensureOnboardingStatus(restaurant.id))   # unchanged, outside tx
```

**Design points:**
- **Atomicity:** org + restaurant + user link succeed or fail together — no
  orphan Organization and no orphan Restaurant. Any error rolls back all three.
- **Use `tx.organization.create`, not the global `createOrganization` helper**
  (the latter uses the module-level `prisma`, escaping the transaction). If a
  reusable helper is desired, add a `tx`-accepting variant; otherwise inline.
- **`organizationId` passed into `createWithUniqueReferralCode`'s data** — it
  already spreads `...data` into `tx.restaurant.create`, and `organizationId` is
  now a valid Restaurant field, so no signature change is required beyond
  including the field.
- **1:1 enforced:** the pre-existing `RestaurantAlreadyExistsError` guard means
  a user can't create a second Business, so each owner gets exactly one
  Organization. (Multi-business is P8.)
- **Return shape unchanged:** `createRestaurant` still returns the `Restaurant`;
  callers/controllers are untouched.
- **Name semantics:** `Organization.name` is seeded from the business name at
  creation and is a **snapshot** (not synced if the business is later renamed).
  Acceptable in P1 — `Organization.name` is unused until later phases; a sync
  rule, if ever wanted, is future work.

---

## 6. Rollback strategy

Reversible at every level; nothing destructive and nothing consumes the data.

1. **createRestaurant integration (PR-P1.2a):** revert the code hunk — new
   businesses simply stop receiving an Organization (their `organizationId`
   stays `NULL`, still valid because the column is nullable). Any Organizations
   already created remain as harmless, unused rows.
2. **Backfill (PR-P1.2b):** Prisma migrations are forward-only, so "rollback" =
   an optional **compensating migration** (`UPDATE "Restaurant" SET
   "organizationId" = NULL; DELETE FROM "Organization";`) — only if truly
   desired. In practice no rollback is needed because the data is additive and
   read by nothing.
3. **Whole phase:** because `organizationId` remains nullable and unused, the
   safest rollback is simply to stop populating it (revert P1.2a); the backfilled
   rows can be left in place with zero impact.

**Why safe:** no schema/DDL change, no existing column altered, no data
destroyed by the forward path, and no reader depends on `organizationId` yet.

---

## 7. Risks

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| R1 | **Race window** — a business created by old code between backfill and integration deploy has a null org. | Low | Deploy **P1.2a before P1.2b** (§4). Any post-integration business already has an org; backfill only closes the pre-existing gap. |
| R2 | **Orphan Organization** — org created but restaurant link fails (new-business path). | Low | Single `$transaction` around org + restaurant + user link → atomic rollback. |
| R3 | **Backfill mis-links** an org to the wrong business. | Very low | Mapping keyed on `Restaurant.ownerId @unique` while the `Organization` table starts empty → provably 1:1. |
| R4 | **Non-idempotent re-run** creates duplicate orgs. | Low | Both DML steps `WHERE organizationId IS NULL`; migration tracked/run-once. |
| R5 | **Lock/duration on `Restaurant`** during the `UPDATE`. | Low | `Restaurant` is a small table (one row per business); the update is fast and inside the migration transaction. |
| R6 | **`gen_random_uuid()` unavailable.** | Very low | Built into Postgres 13+; CI/prod run 16. (If ever an issue, enable `pgcrypto` or generate ids in a TS backfill instead.) |
| R7 | **Seed-created restaurants** (direct `prisma.restaurant.create`) have null orgs in dev/test. | Medium (dev only) | Accepted for P1.2 (nothing reads it). Flagged for P1.3 readiness (§3). |
| R8 | **Reusing `createOrganization` inside the tx** escapes the transaction (global `prisma`). | Low | Use `tx.organization.create` (or a tx-aware helper); called out in §5. |

**Behavioral risk to users: none.** Nothing reads `organizationId`; the resolver
still returns `null`.

---

## 8. Acceptance criteria

1. **New-business path:** `createRestaurant` creates exactly one Organization
   (`name == businessName`, `ownerUserId == ownerId`) and sets the new
   Restaurant's `organizationId`, **all within one transaction**; an induced
   failure rolls back org + restaurant + user link (no orphans). Return value
   and controller behavior unchanged.
2. **Backfill:** every pre-existing Restaurant with `organizationId IS NULL`
   receives exactly one Organization; **count parity** (orgs created == null
   restaurants backfilled); each `Organization.ownerUserId == Restaurant.ownerId`;
   re-running is a no-op.
3. **Invariant:** after P1.2, `SELECT count(*) FROM "Restaurant" WHERE
   "organizationId" IS NULL` is `0` in a migrated+integrated environment (schema
   column remains nullable).
4. **No behavior change:** no endpoint/authorization/UI change; resolver still
   returns `organizationId: null`; full existing suite passes; all `restaurantId`
   scoping intact.
5. **Guardrails honored:** no Membership, billing, Location, `NOT NULL`,
   `ownerId` change, or UI change.
6. **CI green:** lint, typecheck, tests, build; migrate deploy applies the DML
   migration cleanly with **no drift**.

---

## 9. PR breakdown

Two small, additive PRs, deployed **in order** (see §4). Each green on
lint/typecheck/test/build before the next.

### PR-P1.2a — createRestaurant creates + links an Organization (new businesses)
- Extends the existing `createRestaurant` transaction to create the Organization
  and set `organizationId` atomically (§5). Uses `tx.organization.create`.
- Tests: org created with correct `name`/`ownerUserId`; `restaurant.organizationId`
  set; atomic rollback on failure; `createRestaurant` return/behavior unchanged;
  1:1 guard still fires.
- Effect: **new** businesses get an Organization; existing ones still `NULL`.

### PR-P1.2b — Idempotent backfill of existing businesses (data migration)
- Adds the data-only migration (§4): create one Organization per un-orged
  Restaurant, then link by unique `ownerId`, both `WHERE organizationId IS NULL`.
- Tests/verification: count parity, `ownerUserId == ownerId`, zero remaining
  null `organizationId`, idempotent re-run.
- Effect: **every** Business now has exactly one Organization — the 1:1:1
  invariant is established.

> **Exit signal for P1.3:** with P1.2 complete, every Business sits under exactly
> one Organization, so the P1.3 resolver can populate
> `req.tenant.organizationId` and reliably find a non-null value (while still
> tolerating null defensively). The optional `NOT NULL` hardening remains a
> separate, later PR — excluded from P1 to preserve reversibility.

---

*End of P1.2 execution specification. This document specifies work only; it
implements nothing. Implementation is authorized separately and must remain
additive, transaction-atomic, idempotent, schema-DDL-free, and
behavior-preserving, exactly as scoped above.*
