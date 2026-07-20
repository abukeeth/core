# OrderVora — P2.6.2 Execution Specification
## Scoped denials for membership-based authorization (no membership-primary cutover)

> **Document type:** Executable specification for **BOS Phase 2, PR-P2.6.2** —
> the *scoped-denial* step of P2.6.
> **Parent:** `P2_6_EXECUTION_SPEC.md` §6, §9 (row P2.6.2); builds on the P2.6.1
> firewall pattern.
> **Scope:** **Documentation only.** No code, no PR, no schema, no migration.
> Designs P2.6.2 only. Does **not** design or start the membership-primary
> cutover (P2.6.3).
> **Sources audited:** `abukeeth/core` @ `main` `4d3b547` (after PR #32 / P2.6.1
> merged).
> **Date:** 2026-07-20.

---

## 0. Audit of current `main` (`4d3b547`)

**Presence / drift — verified:**
- **P2.6.0** (`OwnerWithoutBusinessError` + STAFF membership on staff creation), **P2.6.1-pre-a** (`membershipRole` STAFF|KITCHEN at creation), **P2.6.1-pre-b** (`reassignStaffRole`, `PATCH /auth/staff/:id/role`), **P2.6.1** (kitchen firewall: `financial-firewall.ts`, `order-redaction.ts`, `deny-financial-for-kitchen.ts`) — all present.
- **`KITCHEN_FIREWALL` defaults to `off`** (`getKitchenFirewallMode`: only `observe`/`enforce` recognized; else `off`).
- Migrations apply cleanly; drift = **"No difference detected."**

**Authorization architecture (what P2.6.2 layers onto):**

| Piece | Behavior today |
|---|---|
| `require-role.ts` | `401` → **legacy grant** (`allowed.includes(req.user.role)`, authoritative, first) → **P2.5 widen** (`isMembershipDualReadEnabled() && req.tenant && membershipGrants`) → `403`. Widen-only: the branch only ever calls `next()`. |
| `membership-authz.ts` | `LEGACY_ROLE_EQUIVALENT` (OWNER→RESTAURANT_OWNER, STAFF→RESTAURANT_STAFF, ADMIN→ADMIN; MANAGER/KITCHEN/MARKETING/SUPPORT→`null`); `membershipInScope` (BUSINESS↔businessId, ORGANIZATION↔organizationId; LOCATION unhonored); `membershipGrants`. |
| `financial-firewall.ts` (P2.6.1) | `isFinanciallyRestricted` + `evaluateFinancialFirewall` → tri-state `allow`/`observe`/`enforce` from a flag×predicate. **This is the reusable veto pattern P2.6.2 generalizes.** |
| Tenant isolation today | Every `/me/*` route resolves the caller's own business via `getOwnRestaurantId(req.user.id)` / `req.tenant.businessId`, and services filter `where: { restaurantId }`. There is **no** route that takes an arbitrary `businessId`, so cross-business access is not currently reachable through the API. |

**Two facts that shape the design honestly:**
1. **Cross-business denial is forward-looking.** With single-business `/me` routing, an actor can only act on their own business today; the scope veto is **defense-in-depth now, load-bearing at P8 (multi-business).**
2. **MANAGER / MARKETING / SUPPORT cannot be assigned yet.** The only membership-creation paths are `createRestaurant` (OWNER) and `createStaff`/`reassignStaffRole` (STAFF|KITCHEN). So role-action rules for MANAGER/MARKETING/SUPPORT are **inert until an assignment path exists** — a named prerequisite (**P2.6.2-pre**, §12), not implemented here (mirrors how KITCHEN needed P2.6.1-pre).

---

## 1. Goal, model, and the line vs. P2.6.3

**Goal:** under a default-off flag, let an in-scope Membership **veto** access that
legacy would allow — denying (a) requests outside the actor's membership scope
(cross-business/cross-scope) and (b) actions outside the actor's role remit — as
an **observable, reversible** access reduction, **without** making membership the
primary authority.

**Model — "legacy grants, membership may veto":**
```
requireRole(allowed):
  401 if unauthenticated
  grant = legacy(allowed)  OR  P2.5-widen(allowed)          ← UNCHANGED (primary authority)
  if not grant → 403                                         ← UNCHANGED
  # P2.6.2 veto (flag-gated, default off):
  if MEMBERSHIP_SCOPED_DENIALS != off and req.tenant and actor has ≥1 membership:
      if scopeVeto(tenant) or roleActionVeto(tenant, action):
          enforce → 403 ;  observe → log "would-deny", allow
  next()
```
- Legacy `Role`/`User.role` is **never removed**; it still produces the base grant. The veto can only *subtract*, never *add* (widening stays P2.5).
- **This is the same shape as the P2.6.1 firewall** (legacy grants staff access; a KITCHEN membership vetoes money). P2.6.2 generalizes that veto to scope + a role→action matrix. The firewall stays a specialized, independently-flagged instance; P2.6.2 must compose with it, not duplicate or contradict it (§10 R5).

**The line vs. P2.6.3 (must not cross):**
- **P2.6.2:** legacy is still the **primary grant**; membership only vetoes in specific scope/role cases; an actor with **no memberships** is judged purely by legacy (never vetoed).
- **P2.6.3 (NOT here):** membership becomes the **primary grant**, legacy demoted to fallback. Do not implement or enable that in P2.6.2.

---

## 2. Which actions must be denied, by MembershipRole

Actions are grouped into **action classes** (each maps to concrete routes in §9).
An in-scope membership role that is **not** permitted for a class is vetoed (in
enforce mode). "✓ = permitted, ✗ = denied." OWNER is the override (§5).

| Action class | OWNER | MANAGER | STAFF | KITCHEN | MARKETING | SUPPORT |
|---|---|---|---|---|---|---|
| **Order prep / lifecycle** (start-preparing, mark-ready, out-for-delivery, complete, cancel) | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| **Order read** (list/get/events, ticket) | ✓ | ✓ | ✓ | ✓ (redacted by P2.6.1) | ✗ | ✓ (read-only support) |
| **Order money** (mark-paid, refund) | ✓ | ✓ | ✓ | ✗ (firewall) | ✗ | ✗ |
| **Payments config** (providers, methods) | ✓ | ✓ | ✗ | ✗ (firewall) | ✗ | ✗ |
| **Analytics / revenue** | ✓ | ✓ | ✗ | ✗ (firewall) | ✓ (revenue redaction deferred — see note) | ✗ |
| **Menu / inventory / modifiers / variants** | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ |
| **Fulfillment ops** (assign driver, status, provider config) | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| **Delivery rules / hours / zones / fees** | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| **Coupons / loyalty / reviews** | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ |
| **Tables / QR** | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| **Customers** (records) | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ |
| **Staff management** (invite/list/activate/reassign) | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Business settings** (restaurant update, setup, site publish) | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |

> **Notes / deliberate boundaries:**
> - **KITCHEN** rows re-state the firewall (money ✗) *and* add non-prep denials (menu/fulfillment/config ✗). Where P2.6.1 already denies (money/payments/analytics), P2.6.2 does not double-deny — the firewall flag owns those; P2.6.2 owns the rest. Both may be enabled independently.
> - **MARKETING + analytics:** revenue endpoints expose money. Granting MARKETING analytics implies a **non-financial analytics view** (traffic/top-items-by-count) — the money-redacted variant is **out of P2.6.2 scope** (a future analytics-redaction task). Until then, treat MARKETING analytics as **✗** in enforce to avoid leaking revenue. (Listed ✓ above as the *intended* remit; enforced as ✗ pending redaction — called out in R6.)
> - **SUPPORT refunds:** support often issues refunds, but refund is a money action; **denied by default** here, grantable later without a schema change (matrix edit).
> - **Staff management / business settings** are already legacy OWNER-only; the matrix keeps them owner-only, so P2.6.2 changes nothing there for legacy owners.

---

## 3. BUSINESS and ORGANIZATION scope behavior

The **scope veto** decides whether the actor's memberships cover the request's
tenant scope. Reuses `membershipInScope` (P2.5) unchanged.

- **In scope (allow):** the actor holds a `BUSINESS` membership with
  `scopeId === req.tenant.businessId`, **or** an `ORGANIZATION` membership with
  `scopeId === req.tenant.organizationId`. An ORG-scoped membership covers **all
  businesses in that org** (org implies its businesses).
- **Out of scope (veto):** the actor holds ≥1 membership but **none** matches the
  request's business or org → deny (enforce) / log (observe).
- **No memberships at all → no veto** (fall through to legacy; coverage-gap
  safety, §6). This is the critical rule that prevents denying legitimate legacy
  users during rollout.
- **LOCATION scope remains unhonored** (no Location entity until P4); a
  LOCATION-scoped membership never satisfies the scope test and is ignored here.
- **Precedence:** ORGANIZATION-scope satisfies any business in the org;
  BUSINESS-scope satisfies only its own business.

---

## 4. Cross-business protection

- The scope veto (§3) is the cross-business guard: an actor whose memberships are
  all for business B is **denied** on a request resolved to business C, even if
  their legacy role would allow — **once such a route exists**.
- **Today this is defense-in-depth**, since `/me/*` routing already pins every
  request to the caller's own business; there is no route accepting an arbitrary
  `businessId`. The veto guarantees that when **P8 (multi-business)** introduces
  business-parameterized routes, the authorization layer already refuses
  out-of-scope access rather than relying solely on service-layer `where`
  filters.
- **Belt-and-suspenders, not a replacement:** service-layer tenant filters
  (`getOwnRestaurantId`, `where: { restaurantId }`) remain; the scope veto adds an
  authorization-layer refusal on top. Neither is removed.

---

## 5. Owner override rules

- An in-scope **OWNER** membership (BUSINESS-scoped to `businessId`, or
  ORGANIZATION-scoped to `organizationId`) is **never vetoed** — neither by scope
  nor by role-action. Owners do everything within their scope.
- A **legacy `RESTAURANT_OWNER`** with no membership is likewise never vetoed
  (no-memberships ⇒ no veto, §6) — so existing owners are unaffected during
  rollout regardless of membership backfill state.
- Owner override is evaluated **before** any role-action veto: if any in-scope
  membership is OWNER, allow. (An actor holding both OWNER and a lesser role
  in-scope is treated as OWNER — highest role wins, mirroring the firewall's
  "money role rescues" rule.)

---

## 6. Safe fallback to legacy authorization

The veto is suppressed (request judged by legacy alone) whenever:
1. `MEMBERSHIP_SCOPED_DENIALS` is `off` (default), **or**
2. `req.tenant` is absent (`TENANT_CONTEXT_ENABLED` off), **or**
3. the actor holds **zero memberships** (coverage gap — never punish a legacy
   user who simply hasn't been granted a membership), **or**
4. the resolver produced no scope (`businessId` and `organizationId` both null).

This makes the veto **fail-open to legacy**: any uncertainty widens rather than
denies. Combined with observe mode (§8), it guarantees no legitimate actor is
denied before coverage is proven.

---

## 7. Feature-flag strategy

- **New flag `MEMBERSHIP_SCOPED_DENIALS`**, tri-state, **default `off`**, reusing
  the exact P2.6.1 pattern (`getScopedDenialMode(): "off" | "observe" | "enforce"`;
  only `observe`/`enforce` recognized, else `off`).
- **Independent** of `MEMBERSHIP_DUAL_READ` (widen), `KITCHEN_FIREWALL`
  (money), and the future `MEMBERSHIP_PRIMARY` (cutover). Ladder:
  `TENANT_CONTEXT_ENABLED` (populate) → `MEMBERSHIP_DUAL_READ` (widen) →
  `KITCHEN_FIREWALL` / `MEMBERSHIP_SCOPED_DENIALS` (targeted vetoes) →
  `MEMBERSHIP_PRIMARY` (cutover, P2.6.3).
- **Doubly gated:** the veto reads `req.tenant`; with `TENANT_CONTEXT_ENABLED` off
  there are no memberships to consult, so the veto is inert.
- Optional per-class sub-gating may be added later; P2.6.2 ships a single flag for
  the whole scoped-denial layer.

---

## 8. Observe-before-enforce rollout

1. Land P2.6.2 with the flag **off** (inert; behavior byte-for-byte P2.5/P2.6.1).
2. Turn `MEMBERSHIP_SCOPED_DENIALS=observe` in prod: every would-veto is
   **logged** (actor, business/org scope, action class, reason: scope|role) but
   access is **not** reduced. Confirm the would-deny stream contains **no**
   legitimate owner/staff request.
3. Only once observation is clean, `=enforce`. Enforce may be enabled for the
   best-covered surfaces first if per-class sub-flags are added; otherwise it is
   all-or-nothing for the scoped-denial layer.
4. Prerequisite gate: do **not** enable enforce for MANAGER/MARKETING/SUPPORT
   rules until their assignment path (P2.6.2-pre) exists and those members are
   covered.

---

## 9. Route inventory (authenticated, tenant-scoped)

Grouped by current legacy gate; each row's action class maps to §2. Platform
`ADMIN` routes (audit-log, admin restaurant list/suspend) are **out of scope**
(platform, not tenant-scoped; no tenant membership).

| Router (mount) | Legacy gate today | Action class (§2) |
|---|---|---|
| `auth /staff*` (create/list/:id/:id/role) | OWNER | Staff management |
| `restaurant` POST `/`, PATCH `/me`, `/me/setup-step` | OWNER | Business settings |
| `restaurant` GET `/me`, onboarding `/progress` GET | OWNER+STAFF | Order/business **read** |
| `onboarding` PATCH `/progress` | OWNER | Business settings |
| `orders` list/get/events | OWNER+STAFF | Order read |
| `orders` start-preparing/mark-ready/out-for-delivery/complete/cancel | OWNER+STAFF | Order prep/lifecycle |
| `orders` mark-paid/refund | OWNER+STAFF (+ firewall) | Order money |
| `payments` providers/methods | OWNER+STAFF (+ firewall) | Payments config |
| `analytics` summary/revenue-by-day/top-items | OWNER+STAFF (+ firewall) | Analytics/revenue |
| `menu`, `menu-commerce` (inventory/modifiers/variants), `import`, `site` | OWNER+STAFF | Menu/inventory (site publish = business settings) |
| `fulfillment` providers/drivers/assign/status/my-assignments | OWNER+STAFF | Fulfillment ops (my-assignments order embed redacted by P2.6.1) |
| `delivery-rules` (config/hours/zones/fees/kitchen-capacity) | OWNER+STAFF | Delivery rules |
| `coupons`, `loyalty`, `reviews` | OWNER+STAFF | Coupons/loyalty/reviews |
| `tables` (QR) | OWNER+STAFF | Tables/QR |
| `customers` | OWNER+STAFF | Customers |
| `pos` | OWNER+STAFF | POS — **treated as Order money/read**; a KITCHEN/MARKETING/SUPPORT actor is vetoed from POS (cashier surface) |

> **Coverage guard:** a test asserts every tenant-scoped router above is mapped to
> an action class, so a newly added router without a class assignment fails CI
> (prevents silent gaps — the R3 mitigation).

---

## 10. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **Veto denies legitimate users** (incomplete membership coverage). | 🔴 | No-memberships ⇒ no veto (§6); observe-before-enforce (§8); flag default off; instant flag rollback; owners never vetoed. |
| R2 | **Access reduction is a regression class** (inverse of P2.5 widen). | 🔴→🟠 | Flag-gated (default off), tri-state observe/enforce, fail-open to legacy, reversible; legacy remains primary grant. |
| R3 | **Missed route / action-class gap** lets a denied role act. | 🟠 | §9 inventory + CI coverage guard mapping every tenant router to a class; per-class tests (§13). |
| R4 | **Over-block** (e.g., denying an owner or a covered staffer). | 🟠 | Owner override (§5); explicit "not-vetoed" tests for OWNER/STAFF; highest-role-wins. |
| R5 | **Conflict/duplication with the P2.6.1 firewall.** | 🟠 | P2.6.2 does not re-deny money surfaces the firewall owns; composition tests with both flags on/off; shared `membershipInScope`. |
| R6 | **MARKETING analytics leaks revenue** if granted before analytics redaction exists. | 🟠 | Enforce MARKETING analytics as ✗ until a money-redacted analytics view exists (§2 note); documented. |
| R7 | **Inert role rules mislead** (MANAGER/MARKETING/SUPPORT unassignable). | 🟡 | §0.2 states it; P2.6.2-pre named prerequisite (§12); enforce for those roles gated on coverage. |
| R8 | **Flag sprawl / operator confusion.** | 🟡 | Documented ladder (§7); tri-state mirrors KITCHEN_FIREWALL exactly; observe logging. |

---

## 11. Acceptance criteria

1. **Flag off ⇒ no change:** with `MEMBERSHIP_SCOPED_DENIALS` off, `requireRole`
   is byte-for-byte P2.5/P2.6.1; full suite passes unchanged.
2. **No-memberships fallback:** an actor with zero memberships is judged by legacy
   only (never vetoed), in observe and enforce.
3. **Scope veto:** in enforce, an actor whose memberships are all out-of-scope for
   the request's business/org is denied; an in-scope (BUSINESS or ORG) membership
   is not. LOCATION never satisfies scope.
4. **Role-action veto:** in enforce, an in-scope role not permitted for the
   action class is denied; a permitted role passes. Matches §2 exactly.
5. **Owner override:** an in-scope OWNER (or legacy `RESTAURANT_OWNER`) is never
   vetoed.
6. **Observe mode:** no denial occurs; every would-veto is logged with
   actor/scope/action/reason; access is unchanged.
7. **Firewall composition:** with `KITCHEN_FIREWALL` and
   `MEMBERSHIP_SCOPED_DENIALS` both on, money surfaces are denied once (no
   double-handling), and non-money kitchen denials come from P2.6.2; with both
   off, behavior is legacy.
8. **Legacy preserved:** no `Role`/`User.role` change; legacy remains the primary
   grant; P2.5 widen unchanged.
9. **Reversible:** flag off restores prior behavior; `enforce→observe`
   de-escalates.
10. **No cutover:** membership is never the primary authority; no
    `MEMBERSHIP_PRIMARY` behavior introduced.
11. **CI green:** migration-check (no schema change), lint, typecheck, build, full
    suite, drift.

---

## 12. PR breakdown

Code-only, additive, reversible; each green on migration-check/lint/typecheck/build/tests/drift.

| PR | Scope | Reduces access? |
|---|---|---|
| **P2.6.2-pre** *(prerequisite, only if MANAGER/MARKETING/SUPPORT rules are to be enforced)* | Assignment path for MANAGER/MARKETING/SUPPORT memberships (extend the pre-a/pre-b staff role model), atomic + idempotent. Additive data only. Not required to ship the OWNER/STAFF/KITCHEN scope+role vetoes. | No |
| **P2.6.2-a** | `getScopedDenialMode` flag (tri-state, default off); pure predicates `membershipCoversScope(tenant)` and `roleActionAllowed(tenant, actionClass)` + the action-class map; `evaluateScopedDenial` → allow/observe/enforce. Wired nowhere yet. | No |
| **P2.6.2-b** | Apply the veto in `require-role.ts` (post-grant, flag-gated, observe/enforce), with an `actionClass` associated per route (route→class table + CI coverage guard). Observe logging. Legacy + P2.5 widen paths untouched when off. | Yes (flag-gated) |

> **Boundary:** P2.6.2 ends here. Do **not** implement or enable
> `MEMBERSHIP_PRIMARY` (P2.6.3). The veto only subtracts from a legacy grant; it
> never becomes the primary authority.

---

## 13. Required test matrix

Legend: **L** = legacy grant present; **M** = membership(s); **S** = in-scope;
outcome under **enforce** unless noted.

| # | Actor / memberships | Route (action class) | Flag | Expected |
|---|---|---|---|---|
| 1 | Legacy STAFF, **no memberships** | order prep | enforce | **allow** (no-memberships fallback) |
| 2 | Legacy STAFF, no memberships | order money | observe | allow + no log |
| 3 | STAFF membership in-scope | order prep | enforce | allow |
| 4 | STAFF membership in-scope | payments config | enforce | **deny** (STAFF ✗ payments) |
| 5 | KITCHEN membership in-scope | order prep | enforce | allow |
| 6 | KITCHEN membership in-scope | menu edit | enforce | **deny** |
| 7 | KITCHEN in-scope | order money | enforce (scoped only) | deny — and **not double-denied** when firewall also on |
| 8 | OWNER membership in-scope | any class | enforce | allow (override) |
| 9 | Legacy RESTAURANT_OWNER, no membership | staff management | enforce | allow (no-memberships fallback) |
| 10 | STAFF membership for **business B**, request business **C** | order prep | enforce | **deny** (out of scope) |
| 11 | ORG membership (org O) , request a business in O | order read | enforce | allow (org covers businesses) |
| 12 | LOCATION-scoped membership | any | enforce | treated as out-of-scope (LOCATION unhonored) |
| 13 | MANAGER in-scope | order money / payments | enforce | allow (MANAGER ✓) — *inert until P2.6.2-pre* |
| 14 | MARKETING in-scope | coupons | enforce | allow; **analytics** | enforce | deny (revenue, R6) |
| 15 | SUPPORT in-scope | order read | enforce | allow; **refund** | enforce | deny |
| 16 | Any restricted actor | any | **off** | allow (byte-for-byte legacy) |
| 17 | Restricted actor | denied class | **observe** | allow + would-deny logged (actor/scope/action/reason) |
| 18 | Actor holding OWNER **and** KITCHEN in-scope | order money | enforce | allow (highest role wins) |
| 19 | No `req.tenant` (context off) | any | enforce | allow (fail-open) |
| 20 | Coverage guard | new tenant router without action class | — | CI fails |

---

*End of P2.6.2 execution specification. Documentation only — it implements
nothing. Scoped denials are a flag-gated (default off), observe-before-enforce,
fully reversible **veto layered on top of legacy** authorization: legacy Role /
User.role remains the primary grant and is never removed, an actor with no
memberships is never vetoed, owners are never vetoed, and membership never
becomes the primary authority (that is P2.6.3, explicitly out of scope). No
schema or migration changes.*
