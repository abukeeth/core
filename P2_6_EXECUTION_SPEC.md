# OrderVora — P2.6 Execution Specification
## Membership-primary cutover + Kitchen financial firewall + scoped denials

> **Document type:** Executable specification for **BOS Phase 2, PR-P2.6** — the
> cutover step. Unlike P2.1–P2.5 (all additive / widen-only), **P2.6 is the
> first step that can *reduce* access**, so the spec is built around coverage
> gating, flag gating, per-surface staging, and instant rollback.
> **Scope:** **Documentation only.** No code, no `schema.prisma`/migration
> changes, no PR.
> **Sources:** `BOS_PHASE2_EXECUTION_PLAN.md` (P2.6), `P2_5_EXECUTION_SPEC.md`,
> `BUSINESS_OS_FOUNDATION.md` (§7 — the "financial firewall" showcase).
> **Repository:** `abukeeth/core` @ `main` `539bf25` (after PR #28 / P2.5 merged).
> **Date:** 2026-07-20.

---

## 0. Phase 2 architectural audit (on `main` after P2.5)

**Presence — all sub-phases verified on `main`:**

| Sub-phase | Evidence | Status |
|---|---|---|
| P2.1 | `model Membership` + `MembershipRole`/`MembershipScope` enums + `membership.service.ts` | ✅ |
| P2.2 | migration `20260720010000_p2_2_backfill_memberships` | ✅ |
| P2.3 | `createRestaurant` → `tx.membership.create` (OWNER @ Org + @ Business) | ✅ |
| P2.4 | resolver populates `req.tenant.memberships` (user-scoped, never-throws) | ✅ |
| P2.5 | `requireRole` dual-read widen branch + `membership-authz.ts` + `MEMBERSHIP_DUAL_READ` flag | ✅ |

**Deep checks:**
- **Authorization flow** (`require-role.ts`): `401` → legacy (`allowed.includes(req.user.role)`, first & unchanged) → widen (`isMembershipDualReadEnabled() && req.tenant && membershipGrants`) → `403` fallthrough. Widen-only confirmed (only `next()` in the branch). ✅
- **Role equivalence map:** `OWNER→RESTAURANT_OWNER`, `STAFF→RESTAURANT_STAFF`, `ADMIN→ADMIN`; `MANAGER/KITCHEN/MARKETING/SUPPORT → null` (grant nothing). ✅
- **Scope enforcement** (`membershipInScope`): `BUSINESS`↔`businessId`, `ORGANIZATION`↔`organizationId`; `LOCATION`/cross-scope/null → false. ✅
- **Feature flags:** `TENANT_CONTEXT_ENABLED` (off) and `MEMBERSHIP_DUAL_READ` (off) — both default off; dual-read inert unless both effectively on. ✅
- **Migration history:** clean ordered chain `…onboarding → p1_organization → p1_2b_backfill → p2_1_membership → p2_2_backfill_memberships`. ✅
- **Drift status:** `migrate deploy` applies all; drift check = **"No difference detected."** ✅
- **Test coverage:** membership.service (4), membership-authz (13), require-role dual-read matrix (8), tenant-context resolver (13). Full suite **1366 passed / 5 skipped / 0 failed.** ✅

### ⚠️ Gap identified (must be closed before cutover)

**Membership coverage is incomplete: only OWNER memberships are created on the
write path.** The **only** app-code membership-creation site is
`createRestaurant` (P2.3, owners). Verified:
- **Staff invited after the P2.3 deploy get a legacy `RESTAURANT_STAFF` role but
  NO `Membership`** — the staff-invite flow (`auth` module) was not wired to
  create a `STAFF @ Business` membership. (Pre-existing staff were covered by the
  P2.2 backfill; *new* staff are not.)
- **No `KITCHEN` / `MANAGER` / `MARKETING` / `SUPPORT` memberships are ever
  created** — there is no role-assignment path for them yet.

This is safe *today* because dual-read is widen-only (missing memberships can't
deny). **It is NOT safe for a membership-primary cutover:** if membership becomes
authoritative, a new staff member with no membership would be **denied** — a
regression. The Kitchen financial firewall also cannot be enforced until a
`KITCHEN` role can actually be assigned.

**Conclusion:** there are **no gaps within the delivered P2.1–P2.5 behavior**
(all correct and consistent), but there **is one remaining Phase-2 coverage gap**
(new-staff + role-assignment membership creation) that is a **hard prerequisite**
for P2.6. This spec therefore folds that prerequisite in as **P2.6.0** rather
than assuming it away.

---

## 1. Objectives

1. **Close the coverage gap (P2.6.0):** create `STAFF @ Business` memberships on
   staff invite (mirroring P2.3 for owners), and add a role-assignment path so
   `KITCHEN` (and later MANAGER/etc.) memberships can exist. Idempotent + atomic,
   like P2.3.
2. **Kitchen financial firewall (P2.6.1):** a `KITCHEN` member must **never** see
   money — deny financial endpoints and strip financial fields from
   order/KDS responses for kitchen actors, regardless of legacy role.
3. **Scoped denials (P2.6.2):** under cutover, a membership grants **only** within
   its scope — deny access outside it even where legacy would allow.
4. **Membership-primary cutover (P2.6.3):** behind `MEMBERSHIP_PRIMARY` (default
   **off**), make membership authoritative **per surface**, only where coverage
   is proven, with legacy retained as an emergency fallback initially.
5. **Reversibility:** every access-reducing behavior is flag-gated (default off)
   and instantly revertible to P2.5 widen-only.

### Non-objectives (guardrails)
- **No DB-enforced isolation (RLS)** — that is P5; P2.6 is app-layer.
- **No Location-scoped denials** — Location is P4; only ORG/BUSINESS scope here.
- **No broad removal of legacy** — legacy stays as fallback; cutover is
  per-surface and coverage-gated.
- **No `Role`/`User.role` schema change.**

---

## 2. Architecture impact

- **New flag `MEMBERSHIP_PRIMARY`** (default off), distinct from
  `MEMBERSHIP_DUAL_READ`. Rollout ladder becomes:
  `TENANT_CONTEXT_ENABLED` (populate) → `MEMBERSHIP_DUAL_READ` (widen) →
  `MEMBERSHIP_PRIMARY` (cut over / enforce denials). Optionally per-surface
  sub-flags (e.g. `KITCHEN_FIREWALL`) for granular staged enablement.
- **`require-role.ts` gains a *deny* path** — but only under `MEMBERSHIP_PRIMARY`
  and only where a membership scope check applies. The P2.5 widen branch is
  unchanged; P2.6 adds an *enforcement* branch that can 403 a request the legacy
  role would have allowed. This is the inversion of P2.5 and the source of all
  P2.6 risk — hence flag-gated + coverage-gated.
- **Response-layer financial redaction** for kitchen actors: a small, central
  "can this actor see money?" predicate (from `req.tenant.memberships`) applied
  where orders/KDS payloads are serialized, plus authz denial on
  payments/analytics endpoints.
- **Membership creation on staff invite** (auth module) + a **role-assignment
  service** (assign/revoke a scoped membership) — the P2.6.0 prerequisite.
- **Unchanged:** schema/migrations, JWT/`requireAuth`, the resolver, the P1
  Organization layer, storefront/public routes, and every response shape when
  the flags are off.

---

## 3. Cutover strategy (staged, coverage-gated, reversible)

1. **P2.6.0 first — complete coverage.** Ship staff-invite membership creation +
   role assignment, and (optionally) re-run the P2.2 backfill so every existing
   and new owner/staff has the correct membership. **Verify parity** (every
   active owner/staff has a membership) before any enforcement flag is enabled.
2. **Enable enforcement per surface, not globally.** Turn on `MEMBERSHIP_PRIMARY`
   (or a per-surface sub-flag) for the **best-covered surfaces first** (owner
   surfaces — owners are fully covered by P2.3), then staff surfaces once P2.6.0
   coverage is confirmed in production.
3. **Kitchen firewall can enable independently** once `KITCHEN` roles are
   assignable — it only *reduces* kitchen visibility and does not depend on full
   staff cutover.
4. **Legacy stays as an emergency fallback** during the initial cutover window
   (a "membership-primary-with-legacy-fallback" mode) so a coverage miss widens
   rather than denies; a later hardening removes the fallback once confidence is
   high. This keeps the first cutover step effectively still non-reducing for
   owner/staff, with the kitchen firewall being the one deliberate reduction.
5. **Observe → tighten.** Log every case where legacy would allow but membership
   would deny (a "would-deny" counter) *before* actually denying, to quantify
   coverage gaps in production prior to flipping enforcement.

---

## 4. Rollback strategy

- **Flag rollback (no deploy):** `MEMBERSHIP_PRIMARY` off (and any sub-flags) →
  authorization returns to **P2.5 widen-only** (legacy authoritative); financial
  redaction and scoped denials are skipped → full legacy access restored. This
  is the production state at merge and the primary lever.
- **Per-surface rollback:** disable the specific sub-flag for a surface that
  shows denials, leaving others enabled.
- **Code revert:** revert the enforcement branch + redaction; P2.6.0 membership
  creation is additive and can stay (it only creates data nothing is forced to
  read).
- **Why safe:** all *reductions* are flag-gated (default off); P2.6.0 data
  creation is additive; no schema/migration change; the "would-deny" observation
  mode lets coverage be proven before enforcement.

---

## 5. Kitchen financial firewall design

**Requirement (blueprint §7):** a KITCHEN member sees order tickets but **never
money**.

- **Financial surface inventory** (what must be hidden from kitchen):
  - Order money fields: `subtotalCents, taxCents, tipCents, deliveryFeeCents,
    serviceFeeCents, discountCents, totalCents`, tips, payments.
  - Endpoints: payments (`/api/restaurants/... payments`), analytics/revenue,
    and any order detail that carries totals.
- **Predicate:** `isFinanciallyRestricted(tenant)` = the actor's effective role
  in scope is `KITCHEN` (a KITCHEN membership in scope, and — under cutover — no
  higher role like OWNER/MANAGER that legitimately sees money). Pure, testable.
- **Two enforcement points:**
  1. **Authz denial** — payments/analytics endpoints deny a kitchen actor
     (`403`) under the firewall flag.
  2. **Response redaction** — order/KDS list & detail serializers **omit** the
     financial fields for a kitchen actor (return the ticket: items, quantities,
     modifiers, status — no money).
- **Flag-gated** (`MEMBERSHIP_PRIMARY` or `KITCHEN_FIREWALL`), default off. With
  the flag off, kitchen visibility is unchanged (today a "kitchen" is only a UI
  concept, not a role, so nothing changes).
- **App-layer now; DB-enforced later:** the true, un-bypassable firewall is RLS
  (P5). P2.6 delivers the app-layer enforcement + the role; P5 makes it
  structural.
- **Must not over-block:** OWNER/MANAGER/STAFF (non-kitchen) financial access is
  unchanged — the predicate targets KITCHEN specifically.

---

## 6. Scoped denial design

- Under `MEMBERSHIP_PRIMARY`, a membership grants access **only** to its scope:
  a `BUSINESS`-scoped membership → only that `businessId`; an `ORGANIZATION`-scoped
  membership → that org's businesses. A request to a scope the actor holds no
  membership for is **denied** even if the legacy role would allow — this is the
  access reduction cutover introduces.
- In P2.6's single-business reality this mainly (a) enforces the kitchen firewall
  and (b) prepares the mechanism; **cross-business** denial becomes materially
  important with **P8** (multi-business) and **Location**-scoped denial with
  **P4/P7** — both explicitly out of P2.6 scope but unblocked by this mechanism.
- **`LOCATION` scope remains unhonored** (no Location entity until P4).
- Reuse `membershipInScope` (P2.5); the change is that, under cutover, *absence*
  of an in-scope grant can deny (whereas P2.5 only used presence to widen).

---

## 7. Acceptance criteria

1. **Coverage (P2.6.0):** staff invited after the change receive a `STAFF @
   Business` membership atomically; a role-assignment path can create `KITCHEN`
   (and other) memberships; parity check shows every active owner/staff has a
   membership. Idempotent.
2. **Flags default off:** with `MEMBERSHIP_PRIMARY` (and sub-flags) off,
   authorization + responses are byte-for-byte **P2.5** behavior; full suite
   passes unchanged.
3. **Kitchen firewall (flag on):** a `KITCHEN` actor is denied payments/analytics
   endpoints **and** receives order/KDS payloads with **all financial fields
   omitted**; OWNER/MANAGER/STAFF financial access is unchanged. Proven by tests
   enumerating every financial surface.
4. **Scoped denial (flag on):** an actor is denied access to a scope for which
   they hold no in-scope membership, even where legacy would allow; an in-scope
   membership still grants.
5. **No uncovered denial:** with the "would-deny" observation confirming full
   owner/staff coverage, enabling enforcement denies **no** legitimate owner/staff
   request on cut-over surfaces.
6. **Reversible:** flags off restore P2.5 widen-only + full legacy access;
   per-surface rollback works.
7. **Guardrails:** no RLS, no Location denial, no schema/migration change, no
   `Role`/`User.role` change, legacy retained as fallback during initial cutover.
8. **CI green:** migration-check (no schema change), lint, typecheck, build,
   full tests, drift detection.

---

## 8. Risk analysis

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **Cutover denies legitimate users** (incomplete coverage — the identified gap). | 🔴 | P2.6.0 closes staff/role coverage *first*; "would-deny" observation mode quantifies coverage in prod before enforcing; per-surface + flag-gated + default off + instant rollback; legacy-fallback during initial window. |
| R2 | **Kitchen firewall over-blocks** (hides money from owners/managers). | 🟠 | Predicate targets KITCHEN specifically; explicit tests that OWNER/MANAGER/STAFF financial access is unchanged. |
| R3 | **Kitchen firewall under-blocks** (kitchen still sees money somewhere). | 🟠 | Enumerate every financial surface (order fields + payments + analytics); redact at the serializer *and* deny at the endpoint; tests per surface. App-layer now, RLS (P5) makes it structural. |
| R4 | **Access reduction is a genuine regression class** (inverse of P2.5's safe widen). | 🔴→🟠 | This is the first reducing step; hence all reductions are flag-gated (default off), staged per-surface, coverage-gated, observable-before-enforce, and reversible. |
| R5 | **New membership-creation paths (staff invite / role assign) create wrong/duplicate grants.** | 🟡 | Atomic (tx), idempotent (natural-key guard, as P2.2/P2.3); parity tests. |
| R6 | **Flag sprawl / partial states** confuse operators. | 🟡 | Clear rollout ladder (populate→widen→primary), documented; sub-flags optional; observation logging. |

---

## 9. Implementation breakdown (multiple small PRs)

Ordered so coverage precedes enforcement; each green on
migration-check/lint/typecheck/build/tests/drift before the next.

| PR | Scope | Depends on | Reduces access? |
|---|---|---|---|
| **P2.6.0** | Staff-invite creates `STAFF @ Business` membership (atomic, idempotent) + role-assignment service (assign/revoke scoped membership, incl. `KITCHEN`); optional backfill re-run + parity check. | P2.3 | No (additive) |
| **P2.6.1** | `MEMBERSHIP_PRIMARY` (+ optional `KITCHEN_FIREWALL`) flag; **kitchen financial firewall** — `isFinanciallyRestricted` predicate, endpoint denial + response-field redaction; **observation mode** ("would-deny" logging). Flag default off. | P2.6.0 | Yes (kitchen only, flag-gated) |
| **P2.6.2** | **Scoped-denial enforcement** under `MEMBERSHIP_PRIMARY` (deny out-of-scope even where legacy allows); reuse `membershipInScope`. Flag default off. | P2.6.1 | Yes (flag-gated) |
| **P2.6.3** | **Per-surface membership-primary cutover** — enable enforcement for proven-covered surfaces (owners first, then staff after coverage confirmed); later hardening removes the legacy fallback. | P2.6.2 | Yes (staged, flag-gated) |

> **Exit signal for Phase 3:** with P2.6 complete, the platform has a
> membership-authoritative, scope-enforcing authorization plane with the kitchen
> financial firewall in place — the foundation Capabilities (P3) gate *features*
> on top of. The un-bypassable, DB-enforced version of isolation + firewall is
> **P5 (RLS)**. Do not start P3 or P5 as part of P2.6.

---

*End of P2.6 execution specification. This document specifies work only; it
implements nothing. Because P2.6 is the first access-reducing step, every
reduction it introduces must be flag-gated (default off), coverage-gated,
staged per-surface, observable-before-enforce, and instantly reversible to P2.5
widen-only, exactly as scoped above. The identified staff/role coverage gap
(P2.6.0) is a hard prerequisite and must land and be verified before any
enforcement flag is enabled.*
