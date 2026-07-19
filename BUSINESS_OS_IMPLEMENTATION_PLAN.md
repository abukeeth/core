# OrderVora — Business OS Implementation Plan

> **Document type:** Implementation plan (converts approved architecture into
> phases). Governance-level; sequencing authority for the BOS evolution.
> **Source of truth:** `BUSINESS_OS_FOUNDATION.md` (the approved architecture).
> **Scope:** **Documentation only.** No code, no `schema.prisma`, no
> migrations, no PRs. This plan describes *what each phase does and how to know
> it's done* — it does not do it.
> **Prime directive:** **Additive evolution only.** Every phase leaves the
> platform shippable and reversible. The existing `Restaurant`/`restaurantId`
> engine keeps working at all times.
> **Repository:** `abukeeth/core` @ branch
> `claude/ordervora-blueprint-gaps-kwyve1` (based on `main` `f126fef`).
> **Date:** 2026-07-19.
> **Companions:** `ORDERVORA_SOURCE_OF_TRUTH.md`, `BLUEPRINT_GAP_MATRIX.md`,
> `PHASE_1_FOUNDATION_COMPLETION_PLAN.md`, `MASTER_EXECUTION_SEQUENCE.md`.

---

## 0. How to read this plan

- **Ordering is by dependency, not date.** Each phase depends only on phases
  above it. No phase may be started before its dependencies are complete.
- **"Data model impact" is conceptual.** It says *what shape* changes and
  *whether it is additive* — it does **not** contain Prisma or SQL. Actual
  schema/migration work is authorized separately, phase by phase, and every
  described change is **additive** (new nullable columns / new tables / new
  join tables) — never a rename or drop in the same step.
- **Backward-compatibility contract (applies to every phase):**
  1. Existing tables are only *added to*.
  2. Existing `restaurantId` routes keep working; new routes are **aliases**.
  3. Existing commerce, website, customer, and dashboard flows are unchanged in
     behavior until a feature explicitly opts into a new layer.
  4. Every phase is independently revertible.
- **The load-bearing reinterpretation** (from the foundation): the existing
  **`Restaurant` == a Business**, and **`restaurantId` == the Business scope
  key**. This holds from Phase 1 onward *by convention* before any physical
  rename (which is deferred to the optional final phase).

### Phase map (dependency order)

```
P0  Terminology & Tenant Context (no schema change)
      │
P1  Organization layer (above Business)
      │
P2  Membership & scoped roles (replaces flat restaurantId+Role, dual-read)
      │
P3  Capability / Module system (seed from BusinessType)
      │
P4  Location layer (below Business; mirror single address)
      │
P5  Database-enforced isolation (RLS/equivalent, keyed on Business)
      │
P6  Billing @ Organization (entitlements → capabilities/quotas)
      │
P7  Multi-location activation (place-specific data separates from Business)
      │
P8  Multi-business ownership & Business Types as profiles
      │
P9  New vertical modules (Age Verification, Inventory-first, etc.) — additive
      │
P10 (Optional, late) physical restaurantId → businessId rename behind aliases
```

---

## PHASE 0 — Terminology & Tenant Context (frame first, zero schema change)

- **Objective:** Adopt the BOS vocabulary (Organization / Business / Location /
  Membership / Capability) in code comments, internal types, and docs, and
  introduce a single **Tenant Context resolution point** in the API that, for
  every request, produces `{ organizationId?, businessId, locationId?,
  memberships, capabilities }`. For legacy requests it resolves to
  `{ org: (none yet), business: restaurantId, location: (default), role: from
  User }` — a strict *superset* of today's behavior.
- **Why it exists:** Every later phase reads and writes through Tenant Context.
  Establishing one resolution seam now means Organization, Location, and
  Capabilities can be *added into the context object* later without touching
  every call site. It also stops new "restaurant" vocabulary from being added
  while the meaning shifts to "business."
- **Repository areas affected:**
  - `apps/api/src/middleware/require-auth.ts`, `require-role.ts` (context is
    attached alongside `req.user`).
  - A new internal context resolver module (conceptually under
    `apps/api/src/lib/` or `apps/api/src/modules/tenancy/`).
  - `apps/api/src/app.ts` (middleware wiring order).
  - Docs: `PROJECT_MEMORY.md` terminology note.
- **Data model impact:** **None.** No schema change. Tenant Context is a
  *resolved runtime object*, not a stored table.
- **API impact:** Additive and invisible — the resolver attaches context to the
  request. No route added or changed; no response shape changes. Existing
  `requireRole` continues to work, now reading role from the context.
- **UI impact:** **None** in behavior. Optionally, begin using "Business" in
  new internal copy; no user-visible change required.
- **Risks:** Low. The only risk is the legacy resolution not being a perfect
  superset — mitigated by asserting it returns exactly today's `restaurantId`
  and role for existing sessions.
- **Acceptance criteria:**
  - Every authenticated request has a resolved Tenant Context whose
    `businessId` equals the current `restaurantId` for legacy sessions.
  - No existing test changes behavior; the full suite passes unchanged.
  - A documented convention exists: new code reads scope from Tenant Context,
    not raw `restaurantId`.

---

## PHASE 1 — Organization Layer (above Business)

- **Objective:** Introduce **Organization** as the commercial root and
  auto-create exactly one Organization wrapping each existing Business (=
  restaurant). Existing owner becomes **Owner** of that Organization.
- **Why it exists:** Billing, portfolio, and cross-business team all need a
  home *above* the operating unit. Adding it now (while every org is trivially
  1:1) makes later billing (P6) and multi-business (P8) additive rather than
  structural.
- **Repository areas affected:**
  - `apps/api/prisma/schema.prisma` (new `Organization` concept + additive link
    from Business — *authorized as a separate additive change; not written
    here*).
  - `apps/api/src/modules/restaurants/*` (Business creation path also creates an
    Organization).
  - Tenant Context resolver (now populates `organizationId`).
  - A back-fill routine (one Organization per existing restaurant).
- **Data model impact:** **Additive.** New `Organization` entity; Business gains
  an optional `organizationId` reference (nullable at first, back-filled). No
  existing column renamed or dropped. `Restaurant.ownerId @unique` is left
  intact — ownership *truth* will move to Membership in P2, not here.
- **API impact:** Additive. New (optional) `/api/organizations/...` read
  endpoints may appear; all existing `/api/restaurants/...` routes unchanged.
  Responses unchanged unless a client opts into org data.
- **UI impact:** Effectively none for single-shop owners (Organization is
  invisible/auto). Optionally an internal "Organization" settings surface stub;
  not required this phase.
- **Risks:**
  - Back-fill correctness (exactly one org per restaurant). *Mitigation:*
    idempotent, count-verified back-fill.
  - Nullable `organizationId` during back-fill window. *Mitigation:* code
    tolerates null → treat as "auto org," never crash.
- **Acceptance criteria:**
  - Every existing Business resolves to exactly one Organization.
  - Existing owner has an Owner relationship to that Organization (interim,
    formalized as Membership in P2).
  - All existing routes/tests pass; no behavior change for existing users.

---

## PHASE 2 — Membership & Scoped Roles (dual-read)

- **Objective:** Introduce **Membership** (User × Role × Scope, where Scope ∈
  {Organization, Business, Location}) as the new access-control source of truth,
  and back-fill one Membership per existing `User.restaurantId` + `Role`
  (`RESTAURANT_OWNER` → Owner @ Organization; `RESTAURANT_STAFF` → Staff @
  Business/Location; platform `ADMIN` → platform-super-admin). Keep the legacy
  `User.restaurantId` + global `Role` **readable** (dual-read) so nothing
  breaks.
- **Why it exists:** The flat, single-restaurant role model cannot express
  "Manager of Location B only," co-owners, or multi-business teams. Membership
  is the plane every later permission decision uses. It also removes the
  `ownerId @unique` limitation *in truth* (ownership becomes a Membership),
  without yet touching that column.
- **Repository areas affected:**
  - `apps/api/prisma/schema.prisma` (new `Membership` concept — additive).
  - `apps/api/src/middleware/require-role.ts` (evaluate permission from
    Membership within Tenant Context, falling back to legacy role during
    dual-read).
  - `apps/api/src/modules/auth/*`, staff-invite flow in `restaurants`/`staff`.
  - Tenant Context resolver (loads memberships).
  - `apps/web/src/app/dashboard/staff/*` (team management reads/writes
    Memberships).
- **Data model impact:** **Additive.** New `Membership` join concept. Legacy
  `User.restaurantId` and `Role` remain for dual-read; they are *not* dropped.
  New roles (Manager, Kitchen, Marketing, Support, Admin) are introduced as
  additive values.
- **API impact:** Additive. New member-management endpoints (scoped invite,
  role assignment). Existing auth/role endpoints keep working. Authorization
  decisions now consult Membership first, legacy role as fallback.
- **UI impact:** Staff/Team screens gain **scope** (which business/location) and
  the expanded role set. Existing single-restaurant staff management continues
  to work (each maps to a Business-scoped Membership).
- **Risks:**
  - **Authorization regressions** — the highest-risk phase. *Mitigation:*
    dual-read (Membership OR legacy role) so access is never *narrower* than
    today during transition; comprehensive permission tests; feature-flag the
    switch from "legacy-primary" to "membership-primary."
  - Migrating the KDS "financial firewall" to the Kitchen role must not expose
    money. *Mitigation:* explicit tests that Kitchen scope sees no financial
    fields.
- **Acceptance criteria:**
  - Every existing user has an equivalent Membership; their effective access is
    identical to before.
  - A Location-scoped role can be granted and is correctly *denied* access to
    sibling locations (proven by test).
  - Kitchen role provably cannot read financial data.
  - Full suite passes; no existing user loses access.

---

## PHASE 3 — Capability / Module System

- **Objective:** Introduce **Capabilities** (toggleable modules) attached to
  each Business, seeded from its **Business Type**. Default every existing
  restaurant to the "restaurant profile" so behavior is byte-for-byte identical
  on day one. Add a single **capability check** usable by routes/UI/AI (analogous
  to `requireRole`, but for features).
- **Why it exists:** Capabilities are the seam that lets one codebase serve many
  verticals. They also give billing (P6) and new verticals (P9) a place to plug
  in. Introducing them now — with everyone defaulted to today's full feature set
  — is a no-op for current users but unlocks all later differentiation.
- **Repository areas affected:**
  - `apps/api/prisma/schema.prisma` (Business gains a capability-set concept —
    additive).
  - New capability-resolution helper (feeds Tenant Context).
  - Registries that already gate behavior by `implemented` flags
    (`commerce/fulfillment/registry.ts`, `payments/registry.ts`,
    `pos/registry.ts`, `notifications/registry.ts`,
    `imports/adapters/registry.ts`) — generalized under the capability concept.
  - `apps/web/src/components/dashboard-nav.tsx` and dashboard pages (nav items
    shown/hidden by capability).
- **Data model impact:** **Additive.** A capability-set per Business (derived
  from type + explicit toggles). No existing data changed; existing businesses
  seeded to "all current modules on."
- **API impact:** Additive. A capability guard may gate *new* optional routes.
  Existing routes remain ungated (they belong to the universal core or the
  restaurant profile everyone has). Optional `/capabilities` read endpoint.
- **UI impact:** Dashboard nav and feature entry points become
  **capability-driven** (a module absent → its nav item hidden). For existing
  restaurants nothing disappears (they have the full profile).
- **Risks:**
  - Accidentally gating a core feature off. *Mitigation:* universal core is
    **never** capability-gated; only optional/vertical modules are; snapshot
    tests that every existing business still exposes today's full nav.
  - Over-fragmentation. *Mitigation:* start with a *small* capability set
    matching existing modules; expand deliberately.
- **Acceptance criteria:**
  - Every existing Business has a capability profile equal to "everything on
    today."
  - A Business with an optional module turned off no longer exposes its
    routes/nav, and turning it on restores them — proven by test.
  - No existing user sees any feature removed.

---

## PHASE 4 — Location Layer (below Business; mirror-only)

- **Objective:** Introduce **Location** beneath each Business and create one
  **default Location** per Business from its current `address/lat/lng/hours`.
  Initially the Location **mirrors** the Business's single-place data —
  place-specific features keep reading from the Business until they explicitly
  opt into the Location layer in P7.
- **Why it exists:** Multi-location is a headline BOS capability, but it must
  arrive invisibly first. Creating the default Location now (as a mirror) means
  P7 can *move* place-specific reads to Location without a data migration later.
- **Repository areas affected:**
  - `apps/api/prisma/schema.prisma` (new `Location` concept + additive
    `businessId` link — additive).
  - `apps/api/src/modules/restaurants/*` (Business creation also creates default
    Location).
  - Tenant Context resolver (populates `locationId` with the default).
  - Modules with place-specific data (`RestaurantHours`, `KitchenCapacity`,
    tables/QR, delivery-rules, inventory) — *read paths noted for P7, not moved
    yet*.
- **Data model impact:** **Additive.** New `Location` entity; each Business gets
  one default Location back-filled from its existing address/hours. No existing
  place data is moved or dropped in this phase — Location is a mirror.
- **API impact:** Additive. Optional `/api/businesses/:id/locations` read
  endpoints. All existing routes unchanged; storefront/order resolution still
  works against the Business.
- **UI impact:** None visible for single-location businesses (the Location layer
  stays hidden until P7). Optional internal "Locations" list showing the single
  default.
- **Risks:**
  - Drift between Business address/hours and the mirrored Location before P7.
    *Mitigation:* single-source until P7 explicitly flips reads; treat Location
    as read-mirror only.
  - Back-fill completeness. *Mitigation:* one default Location per Business,
    count-verified.
- **Acceptance criteria:**
  - Every Business has exactly one default Location mirroring its current
    address/hours.
  - No place-specific behavior changes; storefronts and orders behave
    identically.
  - Full suite passes.

---

## PHASE 5 — Database-Enforced Isolation (RLS or equivalent)

- **Objective:** Introduce database-enforced tenant isolation keyed on the
  **Business** (== today's `restaurantId`, unchanged), rolled out table-by-table
  starting with the most sensitive (`Order`, `Payment`, `Customer`,
  `Restaurant`/Business, catalog). Add the **cross-tenant penetration test** to
  CI (a test that attempts cross-business reads and must fail). Keep app-layer
  scoping intact (belt-and-suspenders).
- **Why it exists:** This is the audit's **#1 risk** and the blueprint's #1
  safety guarantee. It is sequenced here because the isolation key
  (`restaurantId` == Business) is stable and Tenant Context (P0) now provides
  the scope cleanly — so isolation can be added without reshaping anything.
- **Repository areas affected:**
  - `apps/api/prisma/schema.prisma` + a **separately authorized** additive
    policy/migration effort (policies only; no data change).
  - `apps/api/src/lib/prisma.ts` / connection layer (sets tenant scope per
    request from Tenant Context).
  - `.github/workflows/ci.yml` (new cross-tenant RLS test job).
  - `docs/runbooks/` (RLS operations runbook).
- **Data model impact:** **Additive (policy-level).** Row-level policies added;
  no columns renamed/dropped; app-layer `where` filters remain.
- **API impact:** None functionally — requests already scoped correctly continue
  to work; incorrectly-scoped access (a latent bug) is now *blocked* rather than
  leaking. This is a strengthening, not a contract change.
- **UI impact:** None.
- **Risks:**
  - A missed scope in Tenant Context could now *deny* legitimate access.
    *Mitigation:* per-table rollout behind flags; extensive read/write tests per
    table before enabling; app-layer scoping stays as the compatibility net.
  - Performance of policy evaluation on hot paths. *Mitigation:* Business scope
    is the same indexed key used today; resolve context once per request.
- **Acceptance criteria:**
  - The cross-tenant penetration test exists in CI and **fails** on any
    cross-business read/write attempt.
  - Every enabled table denies cross-tenant access at the database layer while
    all legitimate flows pass.
  - App-layer scoping remains present (documented belt-and-suspenders).

---

## PHASE 6 — Billing @ Organization (entitlements → capabilities/quotas)

- **Objective:** Attach **billing/subscriptions** to the Organization
  (Starter/Growth/Pro/Enterprise), and wire **entitlements** so that a plan
  raises or caps the **capabilities** (P3) and quotas (AI/SMS) available to each
  Business. Resolve Stripe **Connect vs BYOP** for platform margin (per the
  audit gap H1) as part of this phase's design.
- **Why it exists:** Billing is the audit's **biggest production blocker** (no
  revenue today). It is sequenced *after* Organization (its home, P1) and
  Capabilities (what entitlements gate, P3), so it becomes an additive wiring
  job rather than a structural one. Activates the currently-inert referral
  rewards.
- **Repository areas affected:**
  - `apps/api/prisma/schema.prisma` (new plan/subscription/entitlement concepts
    — additive).
  - New billing module (conceptually `apps/api/src/modules/billing/`) +
    Stripe integration (relating to existing `commerce/payments/*`).
  - Capability resolver (entitlements bound the capability set).
  - `apps/api/src/modules/restaurants/*` (activate referral reward hook).
  - `apps/web/src/app/dashboard/*` (plan/upgrade surface; billing settings).
- **Data model impact:** **Additive.** Plan/subscription/entitlement entities on
  Organization. No existing data changed.
- **API impact:** Additive. New billing/subscription endpoints and webhooks
  (Stripe Billing). Existing payment/checkout flows unchanged.
- **UI impact:** New plan/billing surfaces (Organization scope, Owner-only). A
  plan may gate optional modules in the dashboard via capabilities.
- **Risks:**
  - Gating a feature a customer already uses behind a paid tier. *Mitigation:*
    grandfather existing businesses' current capability set; entitlements only
    *raise* or gate *new* optional modules, never remove what's in use without
    an explicit product decision.
  - Payment-webhook correctness. *Mitigation:* reuse existing webhook-signature
    verification pattern; idempotency keys.
- **Acceptance criteria:**
  - An Organization can hold a subscription; its plan resolves to a concrete
    capability/quota set per Business.
  - Referral rewards are no longer inert (a reward can be granted).
  - No existing business loses a capability it uses today.

---

## PHASE 7 — Multi-Location Activation

- **Objective:** Flip place-specific data reads from the Business to the
  **Location** layer (created in P4), and enable creating **additional
  Locations** with their own hours, inventory, taxes, QR/tables, KDS, and
  fulfillment options. Master catalog stays at the Business; **availability and
  stock become per-Location**.
- **Why it exists:** Delivers true multi-location — a core BOS promise and a
  requirement for franchise/retail chains. Sequenced after isolation (P5) and
  billing (P6) so location-scoped data is safe and plan-gated.
- **Repository areas affected:**
  - Place-specific modules: `RestaurantHours`, `KitchenCapacity`,
    `commerce/qr-ordering/*` (tables), `commerce/delivery-rules/*`,
    menu-commerce inventory — reads move to Location scope.
  - Order/checkout resolution (an order is placed *at* a Location).
  - Analytics (rollups Location → Business → Organization).
  - `apps/web/src/app/dashboard/*` (Location switcher; per-location settings).
- **Data model impact:** **Additive + read-path move.** Place-specific rows gain
  a Location association (defaulting to the P4 default Location — no data loss).
  Inventory becomes per-Location. Business-level mirrors remain readable during
  the transition.
- **API impact:** Additive. Location-scoped endpoints for hours/inventory/QR/
  fulfillment. Existing single-location routes resolve to the default Location,
  so they keep working.
- **UI impact:** Dashboard gains a **Location context switcher**; place-specific
  settings move under Location. Single-location businesses see a simplified
  view (one location, unchanged experience).
- **Risks:**
  - Order/inventory correctness when a Business has multiple Locations.
    *Mitigation:* orders always carry an explicit Location; inventory decrements
    against the ordering Location; thorough multi-location test scenarios.
  - UX complexity for single-location owners. *Mitigation:* hide the switcher
    when only one Location exists.
- **Acceptance criteria:**
  - A Business can operate 2+ Locations with independent hours/inventory/KDS.
  - An order placed at Location B decrements Location B inventory only.
  - Single-location businesses see no change.
  - Analytics roll up correctly across Locations.

---

## PHASE 8 — Multi-Business Ownership & Business Types as Profiles

- **Objective:** Allow an **Organization to hold multiple Businesses** (relaxing
  the effective 1:1 ownership now that Membership, not `ownerId @unique`, is the
  source of truth), and formalize **Business Type → capability profile**
  (family → type → sub-type) so a new vertical is a *profile*, not a codebase.
- **Why it exists:** Unlocks multi-brand operators, portfolios, and the "one
  platform, every business type" promise. Sequenced after Membership (P2),
  Capabilities (P3), and Billing (P6) — all prerequisites for a portfolio.
- **Repository areas affected:**
  - `apps/api/prisma/schema.prisma` (relax the effective ownership constraint
    **additively** — Membership becomes authoritative; the legacy `ownerId`
    relation is left intact until unused).
  - Business creation flow (create additional Businesses under an existing
    Organization).
  - Business-Type → capability-profile mapping (generalize today's
    `BusinessType` enum into family/type/sub-type + profile).
  - `apps/web/src/app/dashboard/*` (Organization-level business switcher).
- **Data model impact:** **Additive.** Organization→Business becomes 1:N in
  practice (already modeled 1:N in P1; this phase removes the *behavioral* 1:1
  assumption via Membership). Business Type classification enriched additively;
  existing enum values remain valid.
- **API impact:** Additive. Endpoints to create/list Businesses under an
  Organization; a business switcher context. Existing single-business flows
  unchanged.
- **UI impact:** Organization-level **business switcher**; onboarding can create
  a second Business of a different type. Single-business owners unaffected.
- **Risks:**
  - Tenant Context ambiguity with multiple Businesses. *Mitigation:* explicit
    business selection in context; never infer.
  - Cross-business data bleed. *Mitigation:* P5 isolation already blocks this at
    the DB layer.
- **Acceptance criteria:**
  - One Organization can own 2+ Businesses of different Types, each with its own
    capability profile, catalog, and website.
  - Data is provably isolated between sibling Businesses.
  - Adding a new Business Type requires a profile definition, **not** engine
    changes.

---

## PHASE 9 — New Vertical Modules (additive capabilities)

- **Objective:** Add genuinely new, vertical-specific **modules** as
  capabilities — e.g., **Age Verification** (vape/smoke, restricted retail),
  **Inventory-first** management (retail/convenience), **Shipping/Fulfillment**
  (retail), **Reservations** (fine dining) — each shipping to all but enabled
  only for Businesses whose type/plan includes them.
- **Why it exists:** Completes the multi-vertical promise. Sequenced last among
  build phases because it depends on the capability system (P3), isolation (P5),
  billing/entitlements (P6), and multi-business types (P8).
- **Repository areas affected:**
  - New module directories under `apps/api/src/modules/` (each a self-contained
    capability, following the existing registry/adapter pattern).
  - Capability catalog (new capabilities registered).
  - Checkout (age-gate hooks), inventory, storefront (module-driven sections).
  - `apps/web/src/app/dashboard/*` (module surfaces gated by capability).
- **Data model impact:** **Additive.** Each module introduces its own tables,
  scoped to Business/Location. No existing model reshaped.
- **API impact:** Additive. New capability-gated endpoints per module. Existing
  routes unchanged; commerce engine untouched (modules hook in, don't rewrite).
- **UI impact:** New dashboard/storefront surfaces appear only for Businesses
  with the capability enabled.
- **Risks:**
  - Scope creep / inconsistent module patterns. *Mitigation:* every module
    follows the same capability + registry + Tenant-Context contract established
    in P3.
  - Compliance correctness (age verification is legally sensitive).
    *Mitigation:* treat as its own hardened module with explicit tests; do not
    bolt onto checkout ad hoc.
- **Acceptance criteria:**
  - A vape-shop Business enables Age Verification and enforces it at checkout;
    a restaurant Business is unaffected.
  - Each new module is fully isolated, capability-gated, and adds no behavior to
    Businesses without it.
  - The commerce engine is unmodified (modules integrate additively).

---

## PHASE 10 — (Optional, late) Physical `restaurantId → businessId` rename

- **Objective:** Once every consumer reads scope through Tenant Context and the
  new naming, perform the **cosmetic** physical rename of `restaurantId` to
  `businessId` (and `Restaurant` table → `Business`) behind additive aliases,
  reversibly.
- **Why it exists:** Purely for clarity/consistency. **Not required** for any
  BOS capability — the platform is fully multi-vertical *before* this phase.
- **Repository areas affected:** Broad but mechanical: `schema.prisma`, all
  `restaurantId` references (~94), routes, web `lib/api.ts`. Done wholesale, not
  piecemeal.
- **Data model impact:** **Additive-then-cutover.** New naming introduced as an
  alias; old retained until all readers move; only then removed — with a
  reversible plan.
- **API impact:** `/api/businesses/...` becomes canonical; `/api/restaurants/...`
  retained as deprecated aliases through a documented window.
- **UI impact:** Internal only; user-facing copy already says "Business."
- **Risks:** A large mechanical change with regression surface. *Mitigation:* do
  it only after P0–P9, behind aliases, with the full test suite as the safety
  net; skippable entirely if not worth the churn.
- **Acceptance criteria:**
  - All internal references use `businessId`; old routes still resolve via
    aliases; full suite passes; rename is revertible.

---

## Summary — implementation order & gating

| Phase | Delivers | Schema change? | Depends on | Reversible |
|---|---|---|---|---|
| **P0** | Terminology + Tenant Context seam | No | — | Yes |
| **P1** | Organization layer | Additive | P0 | Yes |
| **P2** | Membership & scoped roles (dual-read) | Additive | P1 | Yes |
| **P3** | Capability/Module system | Additive | P2 | Yes |
| **P4** | Location layer (mirror) | Additive | P1 | Yes |
| **P5** | DB-enforced isolation (RLS) | Additive (policy) | P0, P4 | Yes (per-table) |
| **P6** | Billing @ Organization | Additive | P1, P3 | Yes |
| **P7** | Multi-location activation | Additive + read-move | P4, P5, P6 | Yes |
| **P8** | Multi-business ownership & Type profiles | Additive | P2, P3, P6 | Yes |
| **P9** | New vertical modules | Additive | P3, P5, P6, P8 | Yes |
| **P10** | Physical rename (optional) | Additive→cutover | P0–P9 | Yes |

### Where the audit's critical items land
- **RLS (audit risk #1):** **P5** — after the Business scope key is stable and
  Tenant Context exists.
- **Billing (biggest production blocker):** **P6** — right after its home
  (Organization) and its lever (Capabilities) exist.
- **Multi-location / multi-vertical (BOS promise):** **P4/P7** and **P8/P9**.

### Global exit criteria for the BOS evolution
1. Every request resolves a Tenant Context; Business is the stable scope key.
2. Access is governed by scoped Membership; a Location-scoped role is provably
   confined; Kitchen provably sees no money.
3. Features are governed by Capabilities; the universal core is never gated.
4. Tenant isolation is enforced at the database layer with a CI penetration
   test that fails on cross-tenant access.
5. An Organization can hold multiple Businesses of different Types across
   multiple Locations, billed by plan, with new verticals added as profiles +
   additive modules.
6. At no step did the restaurant that exists today stop working.

---

*End of Business OS Implementation Plan. This plan sequences work only; it
builds nothing. Each phase's schema/migration/code is authorized separately and
must remain additive, reversible, and behavior-preserving for existing tenants.*
