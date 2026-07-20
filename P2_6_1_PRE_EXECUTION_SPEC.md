# OrderVora — P2.6.1-pre Execution Specification
## Make `KITCHEN` memberships assignable (the blocking prerequisite for the kitchen financial firewall)

> **Document type:** Executable specification for **BOS Phase 2, PR-P2.6.1-pre** —
> the *minimum safe change* that lets a `KITCHEN` membership be **created and
> assigned**, so the firewall (P2.6.1) has something to enforce against.
> **Parent:** `P2_6_1_EXECUTION_SPEC.md` §0.2 (the identified blocking gap) and §11 (row *P2.6.1-pre*).
> **Scope:** **Documentation only.** No code, no `schema.prisma`/migration
> change, no PR. This spec designs **only** the assignment mechanism. It does
> **not** design or authorize the firewall (P2.6.1), scoped denials (P2.6.2), or
> membership-primary cutover (P2.6.3).
> **Sources audited:** `abukeeth/core` on branch
> `claude/ordervora-blueprint-gaps-kwyve1` @ `f44d5e9` (contains P2.6.0);
> `main` @ `539bf25` (P2.5).
> **Date:** 2026-07-20.

---

## 0. Why this exists (the gap, restated)

The kitchen financial firewall (P2.6.1) keys off an **in-scope `KITCHEN`
membership**. Today **no code path can create one**: the approved P2.6.0 assigns
only `MembershipRole.STAFF`, and `MembershipRole.KITCHEN` exists solely in the
enum. Until a `KITCHEN` membership is assignable, the firewall is inert and
cannot be tested end-to-end. **P2.6.1-pre closes exactly that gap — nothing
more.** It is a pure data-creation change: it adds the *ability to grant a
`KITCHEN` role*, and deliberately changes **no authorization behavior** (the
grant stays inert until the firewall reads it).

---

## 1. Audit — every staff creation & management path

Exhaustive sweep of app code that creates or manages staff / memberships
(`grep` for `RESTAURANT_STAFF`, `membership.create`, `createMembership`,
`MembershipRole.`; routers under `auth`).

### 1.1 Staff **creation** paths

| Path | Route | Service | What it does today |
|---|---|---|---|
| **Invite staff** *(the only one)* | `POST /auth/staff` → `inviteStaff` | `createStaff(ownerId, {email,password,name})` | `assertEmailAvailable` → resolve owner's `restaurantId` (else `OwnerWithoutBusinessError`, P2.6.0) → **tx**: create `User{role: RESTAURANT_STAFF, restaurantId}` + `Membership{role: STAFF, scopeType: BUSINESS, scopeId: restaurantId}`. |
| Owner registration | `POST /auth/register` → `registerOwner` | — | Creates an **owner**, not staff; owner memberships come from `createRestaurant` (OWNER@Org + OWNER@Business). Out of scope. |

`createStaffSchema` = `{ email, password, name }` — **no role field**. There is no
other site that sets `Role.RESTAURANT_STAFF` on a created user
(`fulfillment.service.ts:52` only *reads* staff for driver candidates).

### 1.2 Staff **management** paths

| Path | Route | Service | What it does today |
|---|---|---|---|
| List staff | `GET /auth/staff` | `listStaff(ownerId)` | Reads `User[]` where `restaurantId = owner's`, `role = RESTAURANT_STAFF`. No membership awareness. |
| Activate / deactivate | `PATCH /auth/staff/:id` | `setStaffActive(ownerId, staffId, isActive)` | Verifies the staff belongs to the owner's business & is `RESTAURANT_STAFF`; flips `isActive`; revokes refresh tokens on deactivate. **No role/membership management.** |

**All three routes are gated `requireAuth, requireRole(Role.RESTAURANT_OWNER)`** —
owner-only. There is **no** role-assignment or membership-management endpoint of
any kind.

### 1.3 Membership-creation sites (whole app)

Only two: `createRestaurant` (OWNER@Org + OWNER@Business) and `createStaff`
(STAFF@Business). **Neither creates `KITCHEN`.** No management path mutates a
membership's `role`.

### 1.4 `Membership` model constraints (drives idempotency & migration)

```prisma
model Membership {
  id String @id @default(uuid())
  userId String; role MembershipRole; scopeType MembershipScope; scopeId String
  @@index([userId]); @@index([scopeType, scopeId])   // <-- NON-unique
}
```

**There is no unique constraint** on `(userId, role, scopeType, scopeId)`.
Consequences:
- Idempotency of any *assignment on an existing user* must be enforced by an
  **application-level natural-key guard** (find-then-act in a transaction), not
  by the DB — exactly as the P2.2/P2.3 backfills did.
- `MembershipRole.KITCHEN` **already exists** in the enum, so granting it needs
  **no schema/enum change**.

### 1.5 Invariant observed today

Each staff user holds **exactly one** `BUSINESS`-scoped membership (`STAFF`),
created 1:1 in `createStaff` (owners additionally hold an `ORGANIZATION`-scoped
`OWNER`). P2.6.1-pre must **preserve this "one business-scoped membership per
staff user"** invariant (see §3.3, R1).

---

## 2. Architecture impact

- **No new tenant/authorization concept.** Reuses the existing `Membership`
  entity, `MembershipRole.KITCHEN` (already present), `MembershipScope.BUSINESS`,
  and the P2.6.0 transactional-creation pattern.
- **Creation path gains an optional role selector.** `createStaffSchema` gains an
  **optional** `membershipRole` (or `staffType`) accepting **`STAFF | KITCHEN`
  only** (default `STAFF`). The created **`User.role` stays `RESTAURANT_STAFF`
  unconditionally** — only the *membership* role varies. Backward compatible:
  callers that omit the field get today's exact behavior.
- **A new owner-only management endpoint** to *reassign* an existing staff
  member's business-scoped membership role (`STAFF ↔ KITCHEN`), idempotent &
  atomic. This is the "assign to existing staff / correct a mistake" verb.
- **`listStaff` optionally surfaces the membership role** (read-only) so an owner
  UI can show who is kitchen. Additive field; no behavior change.
- **Authorization is untouched.** `require-role.ts`, the P2.5 widen branch, the
  resolver, and all flags are unchanged. `MembershipRole.KITCHEN` maps to `null`
  in the role-equivalence table (P2.5) — it **grants nothing and denies nothing**.
  The KITCHEN grant is **inert** until the firewall (P2.6.1) reads it.
- **Unchanged:** `schema.prisma`/migrations, `Role`/`User.role`, JWT/`requireAuth`,
  every flag default, owner registration, storefront/public routes, and every
  response shape when the new optional field is omitted.

---

## 3. Role-assignment flow

### 3.1 Creation-time assignment (minimum core)

`POST /auth/staff` with `{ email, password, name, membershipRole?: "STAFF"|"KITCHEN" }`:

1. `assertEmailAvailable(email)`.
2. Resolve owner's `restaurantId`; if none → `OwnerWithoutBusinessError` (reuse
   P2.6.0 — fail safely, create nothing).
3. **One transaction:**
   - `User.create({ role: RESTAURANT_STAFF, restaurantId, … })` *(legacy role
     unchanged, always `RESTAURANT_STAFF`)*.
   - `Membership.create({ role: membershipRole ?? STAFF, scopeType: BUSINESS,
     scopeId: restaurantId })` — **the chosen role, in place of the default
     STAFF** (still exactly one business membership).
4. A brand-new user cannot pre-hold a membership → no duplicate; no guard needed
   (same reasoning as P2.6.0).

### 3.2 Reassignment for existing staff (assign / correct)

New owner-only route (e.g. `PATCH /auth/staff/:id/role`, body
`{ membershipRole: "STAFF"|"KITCHEN" }`):

1. Verify the target is the owner's staff: `staff.restaurantId ===
   owner.restaurantId` **and** `staff.role === RESTAURANT_STAFF`; else
   `StaffNotFoundError` (mirrors `setStaffActive`'s scope check — **no
   cross-business assignment**).
2. **One transaction, natural-key guarded** (no DB unique constraint):
   - Find the staff's existing `BUSINESS`-scoped membership for `scopeId =
     restaurantId`.
   - If it exists and its `role` already equals the target → **no-op**
     (idempotent).
   - If it exists with a different role → **update that one row's `role`**
     (`STAFF → KITCHEN` or back). *Update-in-place preserves the one-membership
     invariant* (§1.5) and, crucially, guarantees a kitchen worker does **not**
     simultaneously hold a money-authorized `STAFF` membership — which is what the
     firewall predicate requires to actually restrict them (see R1).
   - If none exists (edge: pre-P2.6.0 staff never backfilled) → create one with
     the target role.
3. **Revoke = reassign back to `STAFF`** (the safe default), not a raw delete —
   keeps the invariant and never leaves a staff user with zero business
   membership.

### 3.3 Why this reduces **no** access (the safety core)

- `User.role` stays `RESTAURANT_STAFF` for kitchen staff → **all legacy
  authorization is byte-for-byte unchanged** (legacy is authoritative in P2.5).
- Under P2.5 dual-read (widen-only): a `STAFF` membership only ever *widens*, and
  it never widens beyond what legacy `RESTAURANT_STAFF` already allows; a
  `KITCHEN` membership maps to `null` → widens nothing. So swapping `STAFF →
  KITCHEN` **removes no access** (legacy still allows) and **adds no access**.
  Net authorization change = **zero**, with the firewall flag off *or* on-but-unbuilt.
- Therefore P2.6.1-pre is **strictly additive/neutral**: it creates the *data*
  the firewall will later read, and changes behavior **only** once P2.6.1 ships
  and its flag is enabled.

---

## 4. Migration impact

- **None. Code-only.** `MembershipRole.KITCHEN` already exists; assignment uses
  the existing `Membership` table and the existing `MembershipScope.BUSINESS`.
  `migration-check` stays green (no `schema.prisma` diff).
- **Idempotency without a DB constraint:** enforced by the §3.2 application guard
  (find-then-update/create in a transaction), consistent with the P2.2/P2.3
  backfills.
- **Deferred hardening (explicitly NOT in this PR):** a
  `@@unique([userId, role, scopeType, scopeId])` (or a partial unique on
  `(userId, scopeType, scopeId)` to enforce the one-membership invariant) would
  move idempotency into the DB. That is a **schema + migration** change and is
  deferred (aligns with FK/constraint hardening deferred to P4/P5). Keeping
  P2.6.1-pre migration-free maximizes reversibility.
- **No backfill required.** Existing staff keep their `STAFF` membership and can
  be moved to `KITCHEN` on demand via §3.2. (An optional, separate one-shot
  reassignment for a known kitchen roster is possible later but is not needed to
  unblock the firewall.)

---

## 5. Rollback strategy

- **Optional field is self-rolling-back:** omitting `membershipRole` yields
  today's behavior even before any revert, so partially-deployed clients are safe.
- **Code revert (no deploy dependency on data):** revert the schema-field
  addition + the reassignment route + the `listStaff` field. Any `KITCHEN`
  memberships already created are **inert** (nothing authoritative reads them
  until the firewall) and may be left in place or reassigned back to `STAFF` via
  §3.2 (or a trivial data script).
- **No migration to reverse** (code-only), so there is no schema rollback risk.
- **Firewall independence:** because the grant is inert, rolling P2.6.1-pre back
  or forward never changes access on its own — only the firewall flag does, and
  that lever lives in P2.6.1.

---

## 6. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **KITCHEN added *alongside* STAFF** (not replacing it) → under the future firewall the user still holds a money-authorized `STAFF` membership and is **never restricted**. | 🔴 | §3.2 **updates the single business membership in place** (swap role), preserving the one-membership invariant; assign/reassign tests assert **exactly one** business membership with the expected role. |
| R2 | **Assignment silently reduces access** before the firewall exists. | 🟠 | §3.3: legacy `User.role` unchanged; `KITCHEN` maps to `null` grant; tests assert authz identical with `MEMBERSHIP_DUAL_READ` off **and** on, firewall absent. |
| R3 | **Duplicate memberships** (no DB unique constraint). | 🟠 | Application natural-key guard in a transaction (§3.2); creation-time relies on brand-new user (no pre-existing membership); idempotency test (assign twice → one row, no-op second time). |
| R4 | **Cross-business assignment** (owner grants KITCHEN to another business's staff). | 🟠 | Reuse `setStaffActive`'s scope check (`staff.restaurantId === owner.restaurantId`); test rejects cross-business with `StaffNotFoundError`. |
| R5 | **Owner without a business** invites/assigns. | 🟡 | Reuse `OwnerWithoutBusinessError` (P2.6.0) — fail safely, create nothing. |
| R6 | **Legacy-role drift** — someone sets `User.role = KITCHEN`-ish or invents a legacy role. | 🟡 | Invariant: `User.role` is **always `RESTAURANT_STAFF`** for staff; only `Membership.role` varies; no `Role` enum/schema change; test asserts `User.role` unchanged when `membershipRole = KITCHEN`. |
| R7 | **Validation gap** — arbitrary `membershipRole` (e.g. `OWNER`) accepted. | 🟡 | Zod enum restricted to **`STAFF | KITCHEN`** only; MANAGER/MARKETING/SUPPORT/OWNER/ADMIN rejected (out of scope for pre-work). |

---

## 7. Acceptance criteria

1. **Backward compatible creation:** `POST /auth/staff` **without**
   `membershipRole` behaves exactly as P2.6.0 — `User.role = RESTAURANT_STAFF` +
   one `STAFF @ BUSINESS` membership. Existing tests pass unchanged.
2. **KITCHEN at creation:** with `membershipRole = "KITCHEN"`, the created user is
   `RESTAURANT_STAFF` (legacy unchanged) with **exactly one** membership:
   `role = KITCHEN, scopeType = BUSINESS, scopeId = owner's business`. Atomic.
3. **Reassignment (existing staff):** the new owner-only route swaps a staff
   member's business membership `STAFF ↔ KITCHEN` in place; the user still has
   **exactly one** business membership; scoped to the owner's business.
4. **Idempotent:** assigning the same role twice is a no-op (one row, no
   duplicate, no error).
5. **Scope-safe:** cross-business assignment and owner-without-business are
   rejected (`StaffNotFoundError` / `OwnerWithoutBusinessError`); no partial write.
6. **No authorization change:** with the firewall absent and
   `MEMBERSHIP_DUAL_READ` off **and** on, a KITCHEN-membership staff user's access
   is identical to a STAFF-membership staff user's (legacy authoritative). Proven
   by tests.
7. **Validation:** `membershipRole` accepts only `STAFF | KITCHEN`; other values
   are `400`.
8. **No schema/migration:** `migration-check` green (code-only); no `Role` /
   `User.role` / `schema.prisma` change.
9. **CI green:** migration-check, lint, typecheck, build, full suite, drift
   detection.
10. **Firewall unblocked:** an end-to-end fixture can now produce a staff user who
    holds an in-scope `KITCHEN` membership and no money-authorized membership —
    the exact precondition P2.6.1's `isFinanciallyRestricted` needs.

---

## 8. PR breakdown

Ordered; each green on migration-check/lint/typecheck/build/tests/drift. All
code-only, additive, reversible.

| PR | Scope | Reduces access? |
|---|---|---|
| **P2.6.1-pre-a** *(minimum core — unblocks the firewall)* | Extend `createStaffSchema` with optional `membershipRole` (`STAFF`\|`KITCHEN`, default `STAFF`); `createStaff` creates the chosen membership role in the existing transaction (legacy `User.role` still `RESTAURANT_STAFF`). Tests: default unchanged, KITCHEN path, atomic, validation. | No (additive) |
| **P2.6.1-pre-b** *(assign / correct existing staff)* | New owner-only `PATCH /auth/staff/:id/role` → reassign the staff's single business membership `STAFF ↔ KITCHEN` in place, natural-key-guarded, idempotent, scope-checked; surface the membership role (read-only) in `listStaff`. Tests: reassign, idempotency, cross-business rejection, one-membership invariant, access-unchanged. | No (additive) |

> **Boundary:** P2.6.1-pre ends here. It makes `KITCHEN` **assignable** and
> nothing else. **Do not** implement the firewall (P2.6.1), scoped denials
> (P2.6.2), or cutover (P2.6.3). No access is reduced by this work; the first
> deliberate reduction is the firewall, which reads the data this pre-work
> creates and stays flag-gated (default off).

---

*End of P2.6.1-pre execution specification. Documentation only — it implements
nothing. This is the minimum safe change that makes a `KITCHEN` membership
creatable and assignable, strictly additive and authorization-neutral: legacy
`User.role` stays `RESTAURANT_STAFF`, `KITCHEN` grants and denies nothing until
the firewall (P2.6.1) reads it, there is no schema/migration change, and every
step is reversible.*
