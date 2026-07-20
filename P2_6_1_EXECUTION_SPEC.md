# OrderVora — P2.6.1 Execution Specification
## Kitchen financial firewall (financial surface inventory · response redaction · endpoint restrictions · membership-aware enforcement)

> **Document type:** Executable specification for **BOS Phase 2, PR-P2.6.1** —
> the *kitchen financial firewall* sub-step of P2.6.
> **Parent:** `P2_6_EXECUTION_SPEC.md` §2, §5, §9 (row P2.6.1).
> **Scope:** **Documentation only.** No code, no `schema.prisma`/migration
> changes, no PR. This spec designs P2.6.1 **only** — it does **not** design or
> authorize P2.6.2 (scoped denials) or P2.6.3 (membership-primary cutover).
> **Sources audited:** `abukeeth/core` on branch
> `claude/ordervora-blueprint-gaps-kwyve1` @ `dfcec26` (contains P2.6.0);
> `main` @ `539bf25` (P2.5); `BUSINESS_OS_FOUNDATION.md` §7 (the financial
> firewall showcase); `P2_6_EXECUTION_SPEC.md`.
> **Date:** 2026-07-20.

---

## 0. Audit of current state (what P2.6.1 is built on)

### 0.1 Merge / branch reality (stated honestly)

- **PR #29 (P2.6.0) is still OPEN, not merged.** `origin/main` remains at
  `539bf25` (the P2.5 merge). The P2.6.0 code (`createStaff` → atomic
  `STAFF @ BUSINESS` membership; `OwnerWithoutBusinessError`) lives on the
  feature branch at `dfcec26`. **P2.6.1 depends on P2.6.0 landing first**;
  this spec assumes the post-P2.6.0 world and must not be implemented until
  P2.6.0 is merged and verified.

### 0.2 Prerequisite gap — **there is no way to assign a `KITCHEN` membership yet** 🔴

The parent P2.6 spec (§1.1) assumed P2.6.0 would add *"a role-assignment path so
`KITCHEN` (and later MANAGER/etc.) memberships can exist."* The **approved,
narrowed** P2.6.0 that actually shipped does **not** do this:

- `createStaffSchema` (`auth.validation.ts`) has fields `email/password/name`
  **only — no role field**. The single staff path (`createStaff`) always maps to
  `Role.RESTAURANT_STAFF` → `MembershipRole.STAFF`.
- The **only** membership-creation sites in app code are `createRestaurant`
  (OWNER) and `createStaff` (STAFF). **No code path creates a `KITCHEN`
  membership.** Confirmed: `MembershipRole.KITCHEN` appears only in the enum and
  in `membership-authz` tests asserting it grants nothing.

**Consequence for P2.6.1:** the firewall predicate (§4) keys off an in-scope
`KITCHEN` membership. With no such membership assignable, the predicate is
`false` for every actor, so **P2.6.1 ships an inert mechanism** — correct and
safe, but it does **nothing observable in production until a `KITCHEN`
role-assignment path exists.** That assignment path is a **hard prerequisite**
and is called out as **P2.6.1-pre** in the breakdown (§11). P2.6.1 must not be
declared "done / firewall live" until KITCHEN membership can actually be granted
and a test proves an end-to-end kitchen actor is restricted.

### 0.3 Authorization & serialization facts (grounded)

| Fact | Evidence | Why it matters for P2.6.1 |
|---|---|---|
| All owner/staff order, payment, analytics routes are gated by one guard `requireRole(RESTAURANT_OWNER, RESTAURANT_STAFF)`. | `orders.routes.ts`, `payments.routes.ts`, `analytics.routes.ts` | A KITCHEN worker authenticates with legacy `RESTAURANT_STAFF`; the guard alone can't distinguish them from a cashier. The firewall must key off the **membership**, not the legacy role. |
| `require-role.ts` today has **only** a *widen* branch (P2.5), never a deny. | `middleware/require-role.ts:26` | Endpoint restriction (§6) is the **first deny path**; it must be a distinct, flag-gated mechanism, not a change to the widen branch. |
| There is **no central order serializer.** Handlers return raw Prisma objects: `res.json({ order })`, `res.json({ orders })`. | `orders.controller.ts:48,56` | Response redaction (§5) needs a **new central pure helper** applied at each serialization site — there is no single choke point today. |
| Order payloads are fetched with `include: { items: true, payment: true, fulfillment: {...} }`. | `orders.service.ts:27,33` | Redaction must strip money from the **order, its `items`, and its `payment`** — nested, not just top-level. |
| `req.tenant.memberships` is populated by the P2.4 resolver, only when `TENANT_CONTEXT_ENABLED`. Helpers `membershipInScope` exist (P2.5). | `tenant-context.ts:65,143`; `membership-authz.ts:46` | The predicate reuses `membershipInScope`; the firewall is **doubly inert** unless `TENANT_CONTEXT_ENABLED` **and** the firewall flag are on. |

---

## 1. Objectives & non-objectives

### Objectives (P2.6.1 only)
1. **Financial surface inventory** — enumerate every internal, authenticated
   surface that exposes money, so the firewall can be proven exhaustive (§2).
2. **Membership-aware predicate** — a pure `isFinanciallyRestricted(tenant)`
   that is `true` for a kitchen actor (in-scope `KITCHEN` membership, no
   money-authorized membership in scope), reading `req.tenant.memberships` (§4).
3. **Response redaction** — a central helper that strips all financial fields
   (order + items + payment) from order/ticket payloads for a restricted actor,
   returning the *ticket* (items, quantities, modifiers, status) (§5).
4. **Endpoint restrictions** — deny a restricted actor at the purely financial
   endpoints (payments config, analytics/revenue) and the money-mutation order
   actions (mark-paid, refund) with `403` (§6).
5. **Membership-aware enforcement, flag-gated & observable** — everything behind
   a flag (default **off**), with an **observation ("would-restrict") mode** that
   logs but does not enforce, so coverage can be confirmed before enforcing (§7).
6. **Zero change when off** — with the flag off, behavior is byte-for-byte P2.5/P2.6.0.

### Non-objectives (guardrails)
- **No scoped-denial enforcement** across businesses/scopes — that is **P2.6.2**.
- **No membership-primary cutover** of general owner/staff authz — that is **P2.6.3**.
- **No RLS / DB-enforced firewall** — that is **P5**; P2.6.1 is app-layer only.
- **No `KITCHEN` role-assignment implementation in this PR** — it is a *named
  prerequisite* (P2.6.1-pre, §11); this spec does not design its UX beyond
  "a scoped `KITCHEN` membership can be created atomically & idempotently".
- **No `schema.prisma` / migration / `Role` / `User.role` change.**
- **No redaction of customer-facing or public surfaces** — a customer/guest is
  not a kitchen actor (see §2.4); the firewall targets internal kitchen members.

---

## 2. Financial surface inventory

The exhaustive set of **internal, authenticated** money surfaces. Each is
classified **REDACT** (strip money, keep the ticket), **DENY** (kitchen has no
business here at all), or **OUT OF SCOPE** (not a kitchen actor).

### 2.1 Order money fields (the data to hide)
Frozen snapshots on `Order` (`schema.prisma:1043–1049`):
`subtotalCents, taxCents, tipCents, deliveryFeeCents, serviceFeeCents,
discountCents, totalCents`.
Nested: `OrderItem.unitPriceCents, OrderItem.lineTotalCents`
(`1099,1102`); `Payment.amountCents, authorizedAmountCents, capturedAmountCents,
refundedAmountCents` (`1424–1426`, `1404`).

### 2.2 Order surfaces → **REDACT** (return the ticket, omit money)

| Method + path | Handler | Money it carries | Kitchen-relevant non-money (keep) |
|---|---|---|---|
| `GET /api/restaurants/me/orders` | `listOrdersHandler` | each order's 7 `*Cents` + `items[].*Cents` + `payment.*Cents` | order number, status, items (name/qty/modifiers), timestamps, fulfillment status |
| `GET /api/restaurants/me/orders/:id` | `getOrderHandler` | same (single order) | same |
| `GET /api/restaurants/me/orders/:id/events` | `getOrderEventsHandler` | ⚠️ `OrderEvent.payload` (Json) may embed amounts for `PAID`/`REFUNDED` events | event type, actor, timestamp |

> **Note on `/events`:** `OrderEvent` has no `*Cents` column, but its free-form
> `payload Json?` can contain amounts. Redaction here must **either** filter
> money-bearing event types / payload keys **or** (simpler, preferred) omit the
> `payload` for restricted actors, keeping type + timestamp. The inventory flags
> this so it is not missed.

### 2.3 Order money-mutations & pure-financial config → **DENY** (`403`)

| Method + path | Handler | Why deny (not redact) |
|---|---|---|
| `PATCH /me/orders/:id/mark-paid` | `markPaidHandler` | records a cash payment — a financial action, not a kitchen action |
| `POST /me/orders/:id/refund` | `refundHandler` | issues money back — financial |
| `GET/POST/PATCH/DELETE /me/payment-providers*` | `payments.controller` | payment provider config (keys, priority) |
| `GET/PATCH /me/payment-methods*` | `payments.controller` | which tender types are enabled |
| `GET /me/analytics/summary` | `getRevenueSummaryHandler` | `totalRevenueCents`, `averageOrderValueCents` |
| `GET /me/analytics/revenue-by-day` | `getRevenueByDayHandler` | `revenueCents` per day |
| `GET /me/analytics/top-items` | `getTopItemsHandler` | `revenueCents` per item |

> Kitchen **prep actions stay allowed** — `start-preparing`, `mark-ready`,
> `mark-out-for-delivery`, `complete`, `cancel` carry no money and are the
> kitchen's legitimate job.

### 2.4 Surfaces deliberately **OUT OF SCOPE** (not a kitchen actor)
- **Public order tracking** `GET /api/public/orders/:id[/timeline]` — the
  customer's own order via unguessable UUID; the actor is a guest, has no
  membership, and the firewall predicate is `false` for them.
- **Customer order-history / checkout / cart / quote** (`customers/*`,
  `checkout/*`, `cart/*`) — customer-facing; the actor is the paying customer.
- **POS** (`pos/*`) — a cashier surface; a cashier is not a KITCHEN member.
- **Payment webhooks** — unauthenticated, signature-verified machine calls.

These are recorded so the inventory is **provably complete**, and to justify why
they are *not* touched (avoids R2 over-blocking).

---

## 3. Kitchen financial firewall — design overview

Two enforcement points, one predicate, one flag:

```
          req.tenant.memberships ──▶ isFinanciallyRestricted(tenant)  (§4, pure)
                                          │ true (kitchen actor)
        ┌─────────────────────────────────┼─────────────────────────────────┐
        ▼                                                                     ▼
  §6 ENDPOINT RESTRICTION                                        §5 RESPONSE REDACTION
  denyFinancialForKitchen middleware                            redactOrderFinancials helper
  → 403 on §2.3 DENY routes                                     → strip money on §2.2 REDACT routes
        └───────────────── both no-ops unless FLAG on (default off) ─────────┘
```

App-layer now; the un-bypassable, DB-enforced version is **P5 (RLS)** — out of
scope. P2.6.1 delivers the mechanism + the inventory it must cover.

---

## 4. Membership-aware enforcement — the predicate

**`isFinanciallyRestricted(tenant: TenantContext): boolean`** — pure, no I/O,
unit-testable.

```
restricted  ⇔  the actor holds an in-scope KITCHEN membership
               AND holds NO in-scope membership that legitimately sees money
                   (OWNER, MANAGER, STAFF, ADMIN)
```

- **Reuses `membershipInScope`** (P2.5) for the in-scope test (BUSINESS↔businessId,
  ORGANIZATION↔organizationId; LOCATION unhonored).
- **Membership beats legacy role — deliberately.** A kitchen worker signs in as
  legacy `RESTAURANT_STAFF` (which today sees money); the KITCHEN *membership*
  reduces them below that. This is the one **access reduction** P2.6.1
  introduces, and the entire reason it is flag-gated + observable-first.
- **Never over-restricts:** an OWNER, or a user who also holds a STAFF/MANAGER
  membership in scope, is **not** restricted even if they *also* hold KITCHEN —
  the "no money-authorized membership in scope" clause protects them (R2).
- **Inert by construction today:** with no KITCHEN membership assignable (§0.2),
  the predicate is `false` for all actors → no behavior change until P2.6.1-pre.
- **Doubly gated:** `req.tenant` is populated only under `TENANT_CONTEXT_ENABLED`;
  the predicate is only *consulted* under the firewall flag (§7). Off ⇒ inert.

---

## 5. Response redaction — design

**`redactOrderFinancials(order, tenant): OrderView`** — a central pure helper
(new `orders/order-redaction.ts` or a shared `commerce/financial-redaction.ts`):

- If `!isFinanciallyRestricted(tenant)` (or flag off) → **return the order
  unchanged** (identity; zero cost, zero shape change).
- If restricted → return a copy with the money fields **omitted** (not zeroed —
  absence, so a kitchen UI can't render a misleading `$0.00`):
  - order: drop `subtotalCents, taxCents, tipCents, deliveryFeeCents,
    serviceFeeCents, discountCents, totalCents`;
  - `items[]`: drop `unitPriceCents, lineTotalCents` (keep name, qty, modifiers);
  - `payment`: drop entirely (or drop all `*Cents`);
  - `/events`: omit `payload` (keep type/actor/timestamp).
- **Applied at every §2.2 REDACT site**: `listOrdersHandler` (map over `orders`),
  `getOrderHandler`, `getOrderEventsHandler`. Because there is no central
  serializer, each site calls the helper explicitly — the spec lists them so
  none is missed (R3).
- **Type-safe:** the helper returns a narrowed `OrderView` type so a forgotten
  field is a compile error, not a runtime leak.
- **Observation mode** (§7): in observe mode the helper does **not** strip; it
  increments a "would-redact" counter / logs, so redaction volume can be
  measured before enforcing.

---

## 6. Endpoint restrictions — design

**`denyFinancialForKitchen` middleware** (new, in `middleware/`), mounted **after**
`requireAuth` (needs the user) and — because it reads `req.tenant` — composes
with the existing tenant resolver:

- Flag off, or observe mode, or `!isFinanciallyRestricted(req.tenant)` →
  `next()` (in observe mode, log a "would-deny" first).
- Flag on + enforce + restricted → `403` with a stable body
  (`{ error: "Financial data is not available for kitchen access" }`).
- **Mounted only on the §2.3 DENY routes** — payments config router, analytics
  router, and the two money-mutation order routes (`mark-paid`, `refund`). Prep
  actions and REDACT routes are **not** given this middleware (they redact, not
  deny).
- **Distinct from `require-role.ts`.** The P2.5 widen branch is untouched; this
  is a separate, additive deny layer so the firewall can be reasoned about and
  rolled back in isolation. (`require-role` remains widen-only until P2.6.2/2.6.3.)

---

## 7. Feature flags, rollout & observation

- **Flag:** `KITCHEN_FIREWALL` (new `env.ts` helper `isKitchenFirewallEnabled()`,
  default **off**), a per-surface sub-flag under the P2.6 `MEMBERSHIP_PRIMARY`
  umbrella. The kitchen firewall can enable **independently** of the general
  cutover (parent §3.3) because it only *reduces kitchen* visibility.
- **Tri-state, not boolean, to allow observe-before-enforce:**
  `off` (default, inert) → `observe` (predicate runs, "would-restrict/would-deny"
  logged, **no** redaction/denial) → `enforce` (redact + deny).
  Implementation: `KITCHEN_FIREWALL` unset/`off`, `=observe`, `=enforce`.
- **Rollout ladder:** land P2.6.1-pre (KITCHEN assignable) → assign a real
  kitchen user → `observe` in prod, confirm the "would-restrict" counter matches
  expectation and no owner/manager is caught → `enforce`.
- **Inert unless tenant context on:** predicate reads `req.tenant`; with
  `TENANT_CONTEXT_ENABLED` off there are no memberships to consult.

---

## 8. Rollback strategy

- **Flag rollback (no deploy):** `KITCHEN_FIREWALL=off` → redaction is identity,
  the deny middleware `next()`s → full P2.6.0 behavior restored. Primary lever;
  this is the state at merge.
- **De-escalate:** `enforce → observe` keeps measurement without reducing access.
- **Code revert:** the middleware mount + the redaction call-sites are additive;
  reverting them removes the firewall entirely with no data/schema impact.
- **Why safe:** every reduction is flag-gated (default off) and predicate-guarded;
  no schema/migration; the predicate is inert until KITCHEN roles exist.

---

## 9. Acceptance criteria

1. **Inventory complete:** a test enumerates every §2.2 REDACT and §2.3 DENY
   surface; a "no new un-audited money surface" guard (grep/test) fails if a new
   `*Cents`-bearing authenticated order/payment/analytics response is added
   without a redaction/denial decision.
2. **Flag off ⇒ no change:** with `KITCHEN_FIREWALL` off, every order/payment/
   analytics response and status is byte-for-byte P2.6.0; full suite passes
   unchanged.
3. **Predicate correctness:** `isFinanciallyRestricted` is `true` for an in-scope
   KITCHEN-only actor and `false` for OWNER, STAFF, MANAGER, ADMIN, out-of-scope
   KITCHEN, and KITCHEN+STAFF-in-scope. Pure unit tests.
4. **Redaction (enforce):** a restricted actor's `GET /me/orders`,
   `/me/orders/:id`, `/me/orders/:id/events` responses **omit** all money fields
   on order, items, payment, and event payloads, while retaining the ticket
   (items, qty, modifiers, status, timestamps).
5. **Denial (enforce):** a restricted actor receives `403` on payments config,
   all analytics endpoints, and `mark-paid`/`refund`; prep actions
   (`start-preparing`, `mark-ready`, …) still succeed.
6. **No over-block:** OWNER/MANAGER/STAFF financial access (fields + endpoints)
   is unchanged with the flag on — proven by explicit tests.
7. **Observe mode:** with `=observe`, no response is redacted and no request is
   denied, but "would-restrict"/"would-deny" is logged/counted.
8. **Reversible:** `off` restores P2.6.0; `enforce→observe` de-escalates.
9. **Prerequisite honored:** an end-to-end test that a kitchen actor is
   restricted requires a KITCHEN membership to exist (P2.6.1-pre); the firewall
   is not declared live without it.
10. **CI green:** migration-check (no schema change), lint, typecheck, build,
    full suite, drift detection.

---

## 10. Risk analysis

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **Firewall under-blocks** — kitchen still sees money on some surface (esp. the `OrderEvent.payload` JSON or a newly added endpoint). | 🔴 | Exhaustive inventory (§2); redact at the helper **and** deny at the endpoint; the "no un-audited money surface" guard (AC1); explicit `/events` payload handling. |
| R2 | **Firewall over-blocks** — hides money from owners/managers or a kitchen user who is also a manager. | 🟠 | Predicate's "no money-authorized membership in scope" clause (§4); explicit tests for OWNER/MANAGER/STAFF and KITCHEN+STAFF unchanged. |
| R3 | **Missed call-site** — no central serializer, so a REDACT route forgets the helper. | 🟠 | §5 lists every call-site; helper returns a narrowed type so omission is a **compile error**; per-route tests. |
| R4 | **Access reduction is a genuine regression class** (membership below legacy role). | 🔴→🟠 | Flag-gated (default off), tri-state observe-before-enforce, per-surface, instantly reversible; inert until KITCHEN roles exist. |
| R5 | **Ships inert / false sense of "done"** — no KITCHEN role assignable, so the firewall can't be exercised in prod. | 🟠 | §0.2 states it plainly; P2.6.1-pre is a named blocking prerequisite; AC9 forbids declaring the firewall live without an end-to-end kitchen test. |
| R6 | **Predicate reads stale/empty `req.tenant`** when tenant context is off. | 🟡 | Doubly gated (§4, §7); off ⇒ predicate not consulted; resolver never throws (P2.4). |

---

## 11. Implementation breakdown (P2.6.1 only)

Ordered; each green on migration-check/lint/typecheck/build/tests/drift.

| Step | Scope | Reduces access? |
|---|---|---|
| **P2.6.1-pre** *(prerequisite)* | A **KITCHEN role-assignment path** — assign/revoke a scoped `KITCHEN` membership atomically & idempotently (mirroring P2.3/P2.6.0). Without it the firewall is inert. Additive data only. | No |
| **P2.6.1-a** | `isFinanciallyRestricted` predicate + `KITCHEN_FIREWALL` tri-state flag + `env.ts` helper. Pure, wired nowhere yet. | No |
| **P2.6.1-b** | `redactOrderFinancials` helper + apply at the 3 REDACT order call-sites; observe/enforce honored. | Yes (redaction, flag-gated) |
| **P2.6.1-c** | `denyFinancialForKitchen` middleware on the §2.3 DENY routes; observe/enforce honored; "no un-audited money surface" guard test. | Yes (denial, flag-gated) |

> **Boundary:** P2.6.1 ends here. **Do not** implement P2.6.2 (scoped denials)
> or P2.6.3 (membership-primary cutover). The firewall enables **independently**
> of the general cutover and reduces **kitchen** visibility only.

---

*End of P2.6.1 execution specification. Documentation only — it implements
nothing. The kitchen financial firewall reduces access and is therefore
flag-gated (default off), tri-state observe-before-enforce, per-surface, and
instantly reversible to P2.6.0. Its enforcement is inert until a `KITCHEN`
role-assignment path (P2.6.1-pre) exists, which is a hard, explicitly named
prerequisite.*
