# OrderVora — P2.2 Execution Specification
## Membership backfill (existing owners → Owner memberships)

> **Document type:** Executable specification for **BOS Phase 2, PR-P2.2** — the
> idempotent backfill that seeds `Membership` rows for existing tenants.
> **Scope:** **Documentation only.** No code, no `schema.prisma` changes, no
> migrations, no PR. P2.2 is **data-only** — the `Membership` table, enums, and
> service already exist (P2.1). Actual migration/code is authorized separately.
> **Prime directive:** **Additive, idempotent, reversible, inert.** The backfill
> only *creates* Membership rows; it reads nothing into the request path.
> Authorization is unchanged (dual-read is P2.5) — nothing consumes the
> backfilled memberships yet.
> **Sources:** `BOS_PHASE2_EXECUTION_PLAN.md` (P2, PR-P2.2),
> `P2_1_EXECUTION_SPEC.md`, `P1_2_EXECUTION_SPEC.md` / P1.2b (the backfill
> pattern this mirrors).
> **Repository:** `abukeeth/core`, branch `claude/ordervora-blueprint-gaps-kwyve1`.
> **Date:** 2026-07-20.

---

## 1. Current-state audit (what P2.2 builds on)

**Status note (verified):** **PR-P2.1 (#24) is implemented and verified but NOT
yet merged to `main`** — `main` is at `657985c` (P1.3). P2.1 lives on the open
feature branch (`a9bb98b`). **P2.2 depends on P2.1**, so P2.2 must not merge
before P2.1. This spec is written against the P2.1 shape present on the branch.

P2.1 provides (branch `a9bb98b`):
- **`Membership`** model: `id`, `userId → User` (`"UserMemberships"`),
  `role: MembershipRole`, `scopeType: MembershipScope`, `scopeId: String`,
  timestamps; `@@index([userId])`, `@@index([scopeType, scopeId])`. Table is
  **empty**.
- **`MembershipRole`** = `OWNER, ADMIN, MANAGER, STAFF, KITCHEN, MARKETING,
  SUPPORT`. **`MembershipScope`** = `ORGANIZATION, BUSINESS, LOCATION`.
- **`membership.service.ts`**: `createMembership`, `getMembershipsForUser`
  (inert).
- `scopeId` is a soft/polymorphic reference (no DB FK); integrity is a
  service/backfill responsibility (FK hardening deferred to P4/P5).

Source data the backfill maps **from** (verified on the branch):
- **`Organization`**: `id`, `ownerUserId` — the authoritative owner pointer (P1
  hand-off). One org per Business (1:1:1).
- **`Restaurant`** (Business): `ownerId @unique`, `organizationId String?`
  (populated for all rows after P1.2a/P1.2b; still nullable in schema).
- **`User`**: `role: Role` (`ADMIN`/`RESTAURANT_OWNER`/`RESTAURANT_STAFF`),
  `restaurantId String?` (staff→business link).

---

## 2. Objectives

1. **Backfill Owner memberships for every existing owner**, derived from the P1
   Organization layer:
   - **Owner @ Organization** — one per `Organization`
     (`userId = Organization.ownerUserId`, `scopeId = Organization.id`).
   - **Owner @ Business** — one per `Restaurant`
     (`userId = Restaurant.ownerId`, `scopeId = Restaurant.id`).
2. **Backfill Staff memberships** for existing staff (companion to the owner
   backfill, same idempotent pass): **Staff @ Business** — one per `User` with
   `role = RESTAURANT_STAFF` and a `restaurantId`
   (`scopeId = User.restaurantId`).
3. **Guarantee idempotency** — re-running (or a partial-failure retry) creates
   **no duplicates**, via `NOT EXISTS` on the natural key
   `(userId, role, scopeType, scopeId)`.
4. **Change nothing observable** — data-only; no request path, authorization, or
   UI change; nothing reads the new rows yet (dual-read is P2.5).

### Non-objectives (guardrails)
- **No creation-path integration** — new owners/businesses/staff getting
  memberships on creation is **P2.3** (`createRestaurant` / staff-invite).
- **No** platform-`ADMIN` tenant membership (platform admin stays a
  platform-level concept, not a scoped Membership).
- **No** `Location`-scoped memberships (P4), **no** resolver population (P2.4),
  **no** authorization/dual-read change (P2.5/P2.6), **no** uniqueness
  constraint added to the schema (idempotency is via `NOT EXISTS`, not a DB
  constraint — that decision is deferred with the FK hardening).
- **No** change to `Role`/`User.role`/`ownerId`/`restaurantId`.

---

## 3. Backfill strategy (data-only migration, mirrors P1.2b)

A **data-only Prisma migration** (DML, no DDL) — auto-applied once per
environment via `prisma migrate deploy`, transactional (all-or-nothing), and
idempotent via `NOT EXISTS` guards. Three additive `INSERT … SELECT` statements
(order independent; grouped in one migration/transaction):

**(a) Owner @ Organization** — from the authoritative owner pointer:
```
INSERT INTO "Membership" (id, userId, role, scopeType, scopeId, createdAt, updatedAt)
SELECT gen_random_uuid(), o."ownerUserId", 'OWNER', 'ORGANIZATION', o."id", now(), now()
FROM "Organization" o
WHERE NOT EXISTS (
  SELECT 1 FROM "Membership" m
  WHERE m."userId" = o."ownerUserId" AND m."role" = 'OWNER'
    AND m."scopeType" = 'ORGANIZATION' AND m."scopeId" = o."id"
);
```

**(b) Owner @ Business** — from the Business:
```
INSERT INTO "Membership" (...)
SELECT gen_random_uuid(), r."ownerId", 'OWNER', 'BUSINESS', r."id", now(), now()
FROM "Restaurant" r
WHERE NOT EXISTS (
  SELECT 1 FROM "Membership" m
  WHERE m."userId" = r."ownerId" AND m."role" = 'OWNER'
    AND m."scopeType" = 'BUSINESS' AND m."scopeId" = r."id"
);
```

**(c) Staff @ Business** — from staff users:
```
INSERT INTO "Membership" (...)
SELECT gen_random_uuid(), u."id", 'STAFF', 'BUSINESS', u."restaurantId", now(), now()
FROM "User" u
WHERE u."role" = 'RESTAURANT_STAFF' AND u."restaurantId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "Membership" m
    WHERE m."userId" = u."id" AND m."role" = 'STAFF'
      AND m."scopeType" = 'BUSINESS' AND m."scopeId" = u."restaurantId"
  );
```

Notes:
- `gen_random_uuid()` is built into Postgres 13+ (CI/prod run 16), same as P1.2b.
- **Owner @ Organization derives from `Organization.ownerUserId`** (the P1
  hand-off), not from `Restaurant`, so the org-scoped owner is authoritative even
  if a Restaurant row's `organizationId` were ever null.
- If a `Restaurant.organizationId` is null (should not occur after P1.2a/b, but
  the column is nullable), statement (a) still covers that owner via its
  `Organization` (every Business has one), and (b) still creates the
  business-scoped owner membership. No owner is missed.

---

## 4. Idempotency guarantees

- **Natural-key `NOT EXISTS` guard** on `(userId, role, scopeType, scopeId)` in
  every statement → a second run inserts nothing; a partial-failure retry only
  fills the gaps. This is the idempotency mechanism (there is no nullable "flag"
  column to guard on as in P1.2b, so the guard is the tuple existence check).
- **Atomic:** all statements run in the single migration transaction →
  all-or-nothing; a failure leaves **no partial/duplicate** memberships.
- **Run-once by default:** Prisma tracks the migration in `_prisma_migrations`,
  so it applies exactly once per environment; the `NOT EXISTS` guards make
  manual re-execution safe too.
- **No DB uniqueness constraint required** — idempotency is enforced by the
  query, keeping P2.2 additive and not committing to a uniqueness rule the
  creation path (P2.3) might need to revisit.

---

## 5. Repository impact

| Area | Path | Nature of change |
|---|---|---|
| Backfill migration | `apps/api/prisma/migrations/<ts>_p2_2_backfill_memberships/migration.sql` | New **data-only** migration (3 guarded `INSERT … SELECT`). Authorized separately. |
| Verification (no committed test) | live Postgres | Seed owners/staff, run backfill, assert parity + idempotency (as P1.2b). |

**Not touched in P2.2:** `schema.prisma` (no DDL), `membership.service.ts`
(unchanged from P2.1), the tenancy resolver/middleware, `require-auth`/
`require-role`, `restaurants/*` (creation path is P2.3), `apps/web/**`,
`config/env.ts`.

**Seed-script note (carried from P1.2 audit):** `seed-beta.ts` creates a
Restaurant directly; after P2.2 that dev/beta row's owner gets memberships only
if the backfill runs after seeding. Non-blocking (nothing reads memberships
yet); route seeds through the creation path (P2.3) or re-run the backfill in
dev. Flag for P2.4/P2.5 readiness, not P2.2.

---

## 6. Migration-check & drift

- P2.2 changes **no `schema.prisma`**, so the CI migration-check does not fire; a
  DML-only migration leaves the schema-vs-migrations DDL diff empty (no drift) —
  same as P1.2b.
- Verify by applying all migrations to a real Postgres (`migrate deploy`) and
  running the drift check (`migrate diff` DB vs schema → "No difference
  detected").

---

## 7. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **Duplicate memberships** on re-run/partial retry. | 🟠 Med | `NOT EXISTS` natural-key guard on every statement + single atomic transaction. |
| R2 | **Missed owner** if a Restaurant's `organizationId` is null. | 🟡 Low | Owner @ Organization derives from `Organization.ownerUserId` (every Business has an org); Owner @ Business derives from `Restaurant` directly. Both paths independent. |
| R3 | **Wrong owner mapping.** | 🟢 V.Low | `Organization.ownerUserId` and `Restaurant.ownerId @unique` are provably 1:1 from P1; no fan-out. |
| R4 | **Staff without `restaurantId`** (e.g. mid-invite) skipped. | 🟡 Low | Guard `restaurantId IS NOT NULL`; such users legitimately have no business scope yet — the creation/invite path (P2.3) covers them going forward. |
| R5 | **Ordering vs P2.3** — a business created by old code between backfill and the P2.3 creation-path deploy lacks memberships. | 🟡 Low | Same ordering rule as P1.2: ship **P2.3 (creation path) before P2.2 (backfill)** OR re-run the idempotent backfill after P2.3; the `NOT EXISTS` guards make either order safe. (Recommended: P2.3 before P2.2, mirroring P1.2a→P1.2b.) |
| R6 | **`gen_random_uuid()` unavailable.** | 🟢 V.Low | Built into Postgres 13+; CI/prod 16. |

**Behavioral risk: none.** Nothing reads memberships yet; authorization is
unchanged until P2.5.

---

## 8. Acceptance criteria

1. After the backfill, **every `Organization`** has exactly one **Owner @
   Organization** membership (`userId = ownerUserId`).
2. **Every `Restaurant`** has exactly one **Owner @ Business** membership
   (`userId = ownerId`, `scopeId = restaurant.id`).
3. **Every `RESTAURANT_STAFF` user with a `restaurantId`** has exactly one
   **Staff @ Business** membership (`scopeId = restaurantId`).
4. **Idempotent:** a second run inserts **0** rows and the counts are unchanged
   (proven on a real Postgres).
5. **No duplicates:** no two memberships share the same
   `(userId, role, scopeType, scopeId)`.
6. **Platform `ADMIN`** users receive **no** tenant membership from the backfill.
7. **No behavior change:** no endpoint/authorization/UI change; full suite
   passes; nothing reads memberships.
8. **Guardrails honored:** no schema change, no creation-path change, no
   Location scope, no resolver/authorization change.
9. **CI green:** lint, typecheck, tests, build, migration-check; `migrate deploy`
   applies cleanly with **no drift**.

---

## 9. Rollback strategy

- **Data-only & unread:** nothing consumes the backfilled rows, so their presence
  is inert; the safest rollback is to leave them.
- **Compensating migration (if ever needed):** `DELETE FROM "Membership" WHERE
  role IN ('OWNER','STAFF') AND scopeType IN ('ORGANIZATION','BUSINESS')` — but
  only necessary if the rows must be removed; since P2.3+ will also create such
  rows, prefer scoping any deletion carefully or simply not rolling back.
- **Additive & reversible:** no schema/DDL change, no existing column mutated,
  no data destroyed by the forward path.

---

## 10. PR breakdown (P2.2 is a single PR)

**PR-P2.2 — Idempotent membership backfill (data migration).** One PR:
- The data-only migration with the three `NOT EXISTS`-guarded `INSERT … SELECT`
  statements (Owner @ Organization, Owner @ Business, Staff @ Business).
- Live-Postgres verification: seed owners + staff (incl. a re-run), assert
  parity per §8, `UPDATE 0`/insert-0 on the second run, and drift check clean.
- Verified: lint/typecheck/tests/build/migration-check green.

> **Deploy ordering (per §7 R5):** ship **P2.3 (creation path) before P2.2
> (backfill)**, mirroring P1.2a→P1.2b, so no business created during the deploy
> window is left without memberships; the idempotent `NOT EXISTS` guards make
> the backfill safe regardless of order.
>
> **Exit signal for P2.4:** with owners/staff backfilled and the creation path
> (P2.3) live, `req.tenant.memberships` (P2.4) can be populated and reliably find
> the right memberships. Do not start P2.3, P2.4, P2.5, or P2.6 as part of P2.2.

---

*End of P2.2 execution specification. This document specifies work only; it
implements nothing. Implementation is authorized separately and must remain
additive, idempotent (natural-key `NOT EXISTS`), atomic, schema-DDL-free, and
behavior-preserving, exactly as scoped above.*
