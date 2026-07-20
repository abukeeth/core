# OrderVora — P2.6.1-pre-b Execution Specification
## Owner-only reassignment of an existing staff member between STAFF and KITCHEN

> **Document type:** Executable specification for **BOS Phase 2, PR-P2.6.1-pre-b** —
> the *reassignment* half of making `KITCHEN` operable (pre-a added creation-time
> selection; pre-b lets an owner move an **existing** staff member `STAFF ↔
> KITCHEN`).
> **Parent:** `P2_6_1_PRE_EXECUTION_SPEC.md` §3.2 / §8 (row *P2.6.1-pre-b*).
> **Scope:** **Documentation only.** No code, no PR. Designs pre-b only. Does
> **not** design the kitchen firewall (P2.6.1), scoped denials (P2.6.2), or
> membership-primary cutover (P2.6.3).
> **Sources audited:** `abukeeth/core` @ `main` `413596e` (after PR #30 / pre-a
> merged).
> **Date:** 2026-07-20.

---

## 0. Audit of current `main` (`413596e`, post PR #30)

**Merge / presence — verified:**
- PR #30 **merged**; `main` at `413596e`.
- **P2.6.0 present:** `createStaff` throws `OwnerWithoutBusinessError` when the
  owner has no business and otherwise creates a `STAFF @ BUSINESS` membership in
  one `prisma.$transaction`.
- **P2.6.1-pre-a present:** `createStaffSchema.membershipRole:
  z.enum(["STAFF","KITCHEN"]).default("STAFF")`; `createStaff` maps it to
  `MembershipRole.STAFF|.KITCHEN`. STAFF and KITCHEN are assignable at creation
  (7 pre-a tests green).
- **Drift:** `migrate deploy` applies all; `migrate diff` = **"No difference
  detected."**

**Staff surfaces today (the reassignment must fit alongside these):**

| Route | Handler → service | Behavior | Membership-aware? |
|---|---|---|---|
| `POST /auth/staff` | `inviteStaff` → `createStaff` | creates `RESTAURANT_STAFF` + one `STAFF`\|`KITCHEN` `@ BUSINESS` membership (pre-a) | yes (creation only) |
| `GET /auth/staff` | `listStaffHandler` → `listStaff` | lists `User` where `restaurantId = owner's`, `role = RESTAURANT_STAFF`; selects `id,name,email,phone,isActive,createdAt` | **no** (does not expose membership role) |
| `PATCH /auth/staff/:id` | `setStaffActiveHandler` → `setStaffActive` | verifies `staff.role === RESTAURANT_STAFF && staff.restaurantId === owner.restaurantId` (else `StaffNotFoundError`); flips `isActive`; revokes tokens on deactivate | **no** |

All three are `requireAuth, requireRole(Role.RESTAURANT_OWNER)` — **owner-only**.
There is **no** role/membership-reassignment endpoint. `setStaffActive` is the
canonical **same-business ownership check** to mirror.

**Membership entity (drives concurrency / duplicate design):**
- `membership.service.ts` exposes `createMembership`, `getMembershipsForUser` —
  **no update helper**.
- `Membership` has **no unique constraint** — only `@@index([userId])`,
  `@@index([scopeType, scopeId])`. So single-row-ness is an application
  invariant, not a DB guarantee.
- **Invariant today:** every active staff user holds **exactly one**
  `BUSINESS`-scoped membership — created 1:1 by `createStaff` (pre-a) and by the
  P2.2 backfill for pre-existing staff. Pre-b must **preserve** it.

---

## 1. Objectives & non-objectives

### Objectives
Add an **owner-only** endpoint that reassigns an existing staff member's single
`BUSINESS`-scoped membership between **`STAFF` and `KITCHEN`**, **in place**,
atomically, idempotently, and same-business-scoped — **without** changing
`User.role` (stays `RESTAURANT_STAFF`), authorization, schema, or migrations.

### Non-objectives (guardrails)
- **No** kitchen firewall, response redaction, or financial-endpoint denial.
- **No** scoped denials, **no** membership-primary cutover.
- **No** roles other than `STAFF`/`KITCHEN` (no `OWNER/ADMIN/MANAGER/MARKETING/SUPPORT`).
- **No** `Role`/`User.role` change; **no** access reduction.
- **No** `schema.prisma`/migration change **unless strictly unavoidable** — see
  §5, which shows it is **not** unavoidable (an optional unique index is deferred
  hardening, not required).

---

## 2. Endpoint contract

```
PATCH /auth/staff/:id/role
```
- **Auth:** `requireAuth, requireRole(Role.RESTAURANT_OWNER)` (identical to the
  sibling staff routes; a new sub-path under the existing `/staff/:id`).
- **Path param:** `id` — the target staff user id.
- **Body:** `{ "membershipRole": "STAFF" | "KITCHEN" }` — **required, no default**
  (reassignment is an explicit action, unlike creation).
- **Success `200`:** the updated staff summary including its membership role, e.g.
  `{ "staff": { "id", "name", "email", "phone", "isActive", "createdAt", "membershipRole": "KITCHEN" } }`.
- **Errors:**
  - `400` — body fails validation (missing/unknown `membershipRole`, e.g.
    `OWNER`, `MANAGER`, `""`, `null`).
  - `401` — unauthenticated. `403` — not `RESTAURANT_OWNER`.
  - `404` — `StaffNotFoundError`: the id is not a `RESTAURANT_STAFF` user in the
    **owner's** business (covers "no such staff" **and** cross-business attempts
    **and** owner-without-business — never distinguishes them, to avoid leaking
    existence across businesses).
- **Idempotent:** assigning the role the member already has returns `200` with the
  unchanged summary and performs no meaningful write (see §3/§4).
- **Response-shape compatibility:** this is a **new** route; no existing response
  shape changes. (Surfacing `membershipRole` in `GET /auth/staff` is an optional
  additive enhancement — see §9 PR breakdown — never a removal.)

---

## 3. Service flow

`reassignStaffRole(ownerId, staffId, membershipRole: "STAFF"|"KITCHEN"): Promise<StaffSummary>`

1. **Resolve owner's business.** `owner = user.findUnique(ownerId).restaurantId`
   → `businessId`. (No separate owner-without-business error is needed: with a
   null `businessId`, step 2's ownership check fails → `StaffNotFoundError`,
   mirroring `setStaffActive`.)
2. **Verify ownership + staff identity.** Load `staff = user.findUnique(staffId)`.
   Require `staff && staff.role === RESTAURANT_STAFF && staff.restaurantId ===
   businessId`; else throw `StaffNotFoundError`. **This is the same-business
   ownership gate — no cross-business reassignment is possible.**
3. **Reassign the single BUSINESS membership in place, atomically** (§4):
   - `updateMany` the staff's `BUSINESS`-scoped membership(s) for `scopeId =
     businessId` to `role = membershipRole`.
   - The normal case (exactly one membership) updates it **in place** — no new
     row, id preserved. If the anomaly of multiple rows ever exists, `updateMany`
     sets **all** of them to the same target role, so the member can **never**
     simultaneously hold `STAFF` and `KITCHEN` (the firewall-critical invariant).
   - If `count === 0` (a staff member with no business membership — not possible
     for backfilled/pre-a-created staff, so a defensive fallback only): `create`
     one with the target role inside the same transaction.
4. **Return** the staff summary with the now-effective `membershipRole`.

`User.role` is **never** touched — it stays `RESTAURANT_STAFF` throughout.

---

## 4. Transaction strategy

- **One `prisma.$transaction`** wraps the read-verify-write (steps 2–3) so the
  ownership check and the membership mutation commit/roll back together.
- **The mutation is a single atomic statement** — `membership.updateMany({ where:
  { userId: staffId, scopeType: BUSINESS, scopeId: businessId }, data: { role:
  target } })`. This is the key concurrency property: unlike a read-modify-write
  of one row, a set-based `UPDATE` cannot interleave to leave a mixed state, and
  concurrent reassignments resolve to **last-writer-wins on `role`** (both values
  are `STAFF|KITCHEN`, so any outcome is a valid single role — never mixed).
- **Ordering vs. `updatedAt`:** the update bumps `Membership.updatedAt`
  (`@updatedAt`); harmless.
- **No long-held locks / no external I/O** inside the transaction (no email, no
  token work — reassignment doesn't deactivate sessions).

---

## 5. Duplicate-prevention strategy (and why no migration is required)

Goal: **exactly one** `BUSINESS`-scoped membership per staff user, and **never**
`STAFF`+`KITCHEN` at once.

- **Dominant path — pure in-place update.** Every current staff user already
  holds exactly one business membership (P2.2 backfill + pre-a creation), so
  `updateMany` mutates that one row and **inserts nothing** → zero duplicate risk,
  id preserved ("update in place").
- **Anomaly path — set-based collapse.** If multiple business rows somehow exist,
  `updateMany` sets them **all** to the target role in one statement → the
  critical invariant ("never both STAFF and KITCHEN") holds regardless. An
  optional defensive `deleteMany` (keep one) can prune extras in the same
  transaction; not required for firewall correctness.
- **Missing path — guarded create.** `count === 0` triggers a single `create`.
  Because this only runs for a membership-less staff member (which coverage makes
  effectively impossible), and because a hypothetical concurrent double-create
  would produce **same-role** rows (still never mixed), the firewall-critical
  invariant is preserved without a DB constraint.
- **Therefore a schema/migration change is NOT strictly unavoidable.** A
  `@@unique([userId, scopeType, scopeId])` would make single-row-ness a DB
  guarantee and let `upsert` replace the update/create branch, but it is a
  **migration** and is **deferred** (consistent with FK/constraint hardening
  deferred to P4/P5). Pre-b ships **code-only**. *(If a future decision makes the
  unique index desirable, it is a standalone additive migration, reviewed on its
  own — not part of pre-b.)*

---

## 6. Validation

- New schema `reassignStaffRoleSchema = z.object({ membershipRole:
  staffMembershipRoleSchema })` reusing the **existing** pre-a
  `staffMembershipRoleSchema = z.enum(["STAFF","KITCHEN"])` — **no `.default`**
  (the field is required for an explicit reassignment).
- Rejects (`400`) any value outside `STAFF|KITCHEN`
  (`OWNER/ADMIN/MANAGER/MARKETING/SUPPORT`, lowercase, empty, `null`, missing).
- Defense in depth: even if an invalid value bypassed validation, the service
  maps `=== "KITCHEN" ? KITCHEN : STAFF`, so it can only ever write `STAFF` or
  `KITCHEN` — never an elevated role.

---

## 7. Backward compatibility & authorization neutrality

- **New additive route** — no existing route/response shape changes.
  `setStaffActive`, `listStaff`, `createStaff` are untouched.
- **`User.role` stays `RESTAURANT_STAFF`** → legacy authorization (authoritative
  in P2.5) is byte-for-byte unchanged.
- **No access change either direction:** under P2.5 dual-read a `STAFF`
  membership never widens beyond what legacy `RESTAURANT_STAFF` already grants,
  and `KITCHEN` maps to `null` (grants nothing). So `STAFF↔KITCHEN` reassignment
  **adds and removes zero effective access** with `MEMBERSHIP_DUAL_READ` off or
  on. The membership only becomes meaningful once the firewall (a later,
  flag-gated PR) reads it.

---

## 8. Rollback strategy

- **Code revert:** the route + `reassignStaffRole` + validation schema are
  additive; reverting removes the endpoint entirely. Any membership `role` values
  it changed are inert (nothing authoritative reads `KITCHEN` until the firewall)
  and can be moved back with the same endpoint or a one-line data update.
- **No migration to reverse** (code-only), so no schema rollback.
- **Firewall independence:** because the grant is inert, rolling pre-b back or
  forward never changes access on its own.

---

## 9. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **Member left holding both STAFF and KITCHEN** → the future firewall never restricts them (a money-role membership co-exists). | 🔴 | Set-based `updateMany` mutates **all** business rows to the target role in one atomic statement (§4); never a mixed state; test asserts exactly one row with the target role after reassign. |
| R2 | **Cross-business reassignment** (owner edits another business's staff). | 🟠 | Same-business gate mirrors `setStaffActive` (`staff.restaurantId === owner.restaurantId && role === RESTAURANT_STAFF`), else `StaffNotFoundError` (§3.2); test rejects cross-business. |
| R3 | **Duplicate membership row inserted.** | 🟠 | Dominant path is pure update (no insert); create only on `count === 0`; single-statement update avoids read-modify-write races; residual same-role duplicate is benign (§5). |
| R4 | **Silent authorization change.** | 🟠 | `User.role` unchanged; `KITCHEN→null` grant; test asserts authz identical with dual-read off **and** on (§7). |
| R5 | **Concurrent reassignments race.** | 🟡 | `updateMany` is atomic; last-writer-wins on `role` yields a valid single role either way; wrapped in a transaction with the ownership check. |
| R6 | **Unsupported role slips through** (e.g. `OWNER`). | 🟡 | Zod enum `STAFF|KITCHEN`; service fail-closed mapping to `STAFF` for anything non-`KITCHEN` (§6). |
| R7 | **Idempotent re-assign writes/errors needlessly.** | 🟡 | Re-assigning the current role updates the row to the same value (harmless) or is short-circuited to a no-op; returns `200`; test asserts one row, unchanged role, no duplicate. |

---

## 10. Tests

1. **Reassign STAFF→KITCHEN:** an existing `STAFF@BUSINESS` member becomes
   `KITCHEN@BUSINESS`; **exactly one** membership; `User.role` still
   `RESTAURANT_STAFF`.
2. **Reassign KITCHEN→STAFF:** the reverse; exactly one; role unchanged.
3. **Never mixed:** after any reassign, the member holds exactly one
   `BUSINESS`-scoped membership and never both `STAFF` and `KITCHEN`.
4. **Idempotent:** assigning the member's current role again is a no-op — one
   row, same role, no duplicate, `200`.
5. **Same-business enforcement:** reassigning a staff member of a **different**
   business → `StaffNotFoundError` (`404`); no write.
6. **Non-staff / missing target:** a non-existent id or a non-`RESTAURANT_STAFF`
   user → `StaffNotFoundError`; no write.
7. **Owner without business:** `businessId` null → `StaffNotFoundError`; no write.
8. **Validation:** `OWNER/ADMIN/MANAGER/MARKETING/SUPPORT`, `""`, `null`, missing
   → `400`; no service call.
9. **Authorization neutrality:** with the firewall absent and
   `MEMBERSHIP_DUAL_READ` off **and** on, a reassigned member's access is
   identical before/after (legacy authoritative).
10. **Transaction/atomicity:** if the membership mutation fails, the ownership
    read/verify commits nothing observable (rejects; no partial state).
11. **Controller mapping:** `StaffNotFoundError → 404`, success → `200` with the
    summary including `membershipRole`.

---

## 11. Acceptance criteria

1. `PATCH /auth/staff/:id/role` (owner-only) reassigns an existing staff member's
   single `BUSINESS` membership `STAFF↔KITCHEN` **in place**, atomically.
2. The member **never** holds `STAFF` and `KITCHEN` simultaneously; **exactly
   one** business membership after any reassign.
3. `User.role` remains `RESTAURANT_STAFF`; **no** authorization change (proven
   dual-read off and on).
4. Same-business ownership enforced; cross-business and owner-without-business →
   `404`; no write.
5. Only `STAFF|KITCHEN` accepted; everything else → `400`.
6. Idempotent when assigning the current role; no duplicate row.
7. Backward compatible: existing staff routes/response shapes unchanged; the new
   route is additive.
8. **No schema/migration change**: `migration-check` green (code-only).
9. **CI green:** migration-check, lint, typecheck, build, full suite, drift.

---

## 12. PR breakdown

Code-only, additive, reversible. Each green on
migration-check/lint/typecheck/build/tests/drift.

| PR | Scope | Reduces access? |
|---|---|---|
| **P2.6.1-pre-b** *(single PR)* | `reassignStaffRoleSchema` (validation); `reassignStaffRole` service (owner+same-business verify → atomic `updateMany` to target role, create-if-missing fallback, all in one `$transaction`); `PATCH /auth/staff/:id/role` route + controller (`StaffNotFoundError→404`, `200` with summary incl. `membershipRole`). Tests per §10. | No (additive) |
| *(optional, same PR or a small follow-on)* | Additively surface `membershipRole` in `GET /auth/staff` (new field on the staff summary; nothing removed) so owners can see who is kitchen. | No (additive) |

> **Boundary:** pre-b ends here. With pre-a (creation-time) + pre-b
> (reassignment), a `KITCHEN` membership can be fully managed — the last
> prerequisite before the kitchen firewall (P2.6.1). **Do not** implement the
> firewall, scoped denials, or cutover in pre-b.

---

*End of P2.6.1-pre-b execution specification. Documentation only — it implements
nothing. Reassignment is strictly additive and authorization-neutral: it mutates
one BUSINESS-scoped membership between STAFF and KITCHEN in place via a single
atomic set-based update (never leaving a mixed state), keeps `User.role =
RESTAURANT_STAFF`, enforces same-business ownership, is idempotent, needs no
schema/migration change, and is fully reversible.*
