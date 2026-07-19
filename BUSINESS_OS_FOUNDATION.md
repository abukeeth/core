# OrderVora — Business Operating System Foundation

> **Document type:** Foundational architecture (governance-level, 5+ year horizon).
> **Authors' role:** Chief Architect / Principal Systems Designer / CTO.
> **Scope:** **Documentation only.** No code, no migrations, no `schema.prisma`
> changes, no PRs. This document designs the *foundation* every future feature
> will build on — it does not implement anything.
> **Prime directive:** Do **not** rebuild OrderVora. Evolve it — additively —
> from a restaurant-centric platform into a multi-vertical **Business Operating
> System (BOS)**.
> **Mental model:** Think **Shopify + Square + Toast + HubSpot combined**, not
> "a restaurant app." One platform, one codebase, every local business type.
> **Repository:** `abukeeth/core` @ `main` `f126fef`. **Date:** 2026-07-19.
> **Companion docs:** `ORDERVORA_SOURCE_OF_TRUTH.md`, `BLUEPRINT_GAP_MATRIX.md`,
> `PHASE_1_FOUNDATION_COMPLETION_PLAN.md`, `MASTER_EXECUTION_SEQUENCE.md`.

---

## The one idea this document exists to establish

Today OrderVora's universe has a single root noun: **Restaurant**. Every table,
route, permission, website, and payment hangs off `restaurantId`. That noun is
load-bearing — and it is also the ceiling. A vape shop is not a restaurant. A
retail chain with four locations is not a restaurant. A franchise is not a
restaurant.

The BOS foundation replaces the *conceptual* root — **not the physical table** —
with a three-level spine:

```
Organization  →  Business  →  Location
```

…plus two cross-cutting planes that attach to that spine: **Membership**
(who can do what, where) and **Capabilities/Modules** (what a business can do,
by type). The existing `Restaurant` row becomes **one Business of type
`RESTAURANT` with one Location** — reinterpreted, not rewritten. That single
reinterpretation is the whole strategy. Everything below elaborates it.

---

# SECTION 1 — Current State Analysis

*All claims here are verified against the repository (see
`ORDERVORA_SOURCE_OF_TRUTH.md`).*

### 1.1 Current tenant model
- The **tenant is `Restaurant`**. It is the isolation boundary for the entire
  product. Roughly **94 `restaurantId` foreign-key references** across ~90
  models tie every domain object (menu, orders, payments, coupons, loyalty,
  reviews, sites, imports, tables, delivery rules) back to a single restaurant.
- There is **no `Organization`, no `Business`, no `Location`** entity. A
  "restaurant" simultaneously plays all three roles: it is the billing entity,
  the operating entity, and the physical place.
- Isolation is enforced in **application code** (every service filters by
  `restaurantId`, gated by `requireAuth` + `requireRole`), **not** by database
  Row-Level Security.

### 1.2 Current ownership model
- **One owner, one restaurant.** `Restaurant.ownerId` is declared `@unique`,
  and `User` carries an `ownedRestaurant` back-relation. This hard-codes a
  strict **1:1 owner↔restaurant** relationship at the schema level.
- Consequence: a single person/company **cannot** own two businesses, and a
  business **cannot** have two owners. Multi-brand operators, franchises, and
  co-owners are structurally impossible today.

### 1.3 Current role model
- Roles are a **flat, global enum** on `User`: `ADMIN`, `RESTAURANT_OWNER`,
  `RESTAURANT_STAFF` (plus a staff-invite chain and an `isActive` kill switch).
- A user belongs to **one** restaurant via `User.restaurantId` (the
  `RestaurantMembers` relation). Roles are **not scoped to a location** and are
  **not scoped per-business** — a user has exactly one role in exactly one
  restaurant.
- "Kitchen," "Manager," "Marketing," "Support" are **not** first-class roles.
  "Kitchen" exists only as a **UI/route concept** (the KDS page), not a
  permission boundary in data.

### 1.4 Restaurant dependencies (conceptual coupling)
- The **domain vocabulary is restaurant-shaped** end to end: `MenuCategory`,
  `MenuItem`, `KitchenCapacity`, `RestaurantHours`, table/QR "dine-in,"
  fulfillment types built around pickup/delivery/dine-in.
- The setup wizard (`SetupStep`) and onboarding assume a menu-first business.
- The website renderer's sections (hero, menu-section, signature-dishes,
  best-sellers) are food-oriented, though structurally generic.

### 1.5 `restaurantId` dependencies (physical coupling)
- `restaurantId` is the **universal scoping key**. It appears in query filters,
  route params (`/api/restaurants/:restaurantId/...`), JWT-derived context,
  storefront resolution, and analytics.
- This is simultaneously the platform's **greatest asset** (a consistent,
  battle-tested isolation key with real tests behind it) and its **tightest
  constraint** (it assumes the tenant, the operator, and the place are the same
  thing).

### 1.6 Current limitations (the ceiling)
1. **No multi-location** — a business is a single point with one
   `lat/lng/address`; inventory/hours cannot vary by site.
2. **No multi-business ownership** — `ownerId @unique` blocks portfolios,
   brands, and franchises.
3. **No org layer** — nothing to attach billing, cross-business analytics, or a
   shared team to.
4. **Vertical vocabulary is baked in** — "Restaurant/Menu/Kitchen" leaks into
   data, not just copy, making non-food verticals awkward.
5. **Roles don't scope to place or business** — you cannot say "Manager of
   Location B only."
6. **Isolation is code-enforced only** — no RLS; correctness depends on
   developer discipline (the #1 risk in the audit).
7. **Capabilities are implicit** — every business gets every feature; there is
   no notion of "this business type enables these modules."

**Bottom line:** The engine is excellent and must be preserved. The *frame*
around it — one restaurant = one everything — is what limits OrderVora to a
single vertical. The BOS foundation re-frames without re-engineering.

---

# SECTION 2 — Business OS Vision

The future architecture is a **stable spine** plus **cross-cutting planes**.

### 2.1 The five foundational concepts

- **Organization** — the *account / commercial root*. The entity that signs up,
  holds **billing**, owns the team, and can contain one or many Businesses. For
  a single-shop owner this is invisible (auto-created, 1:1). For a
  brand/franchise it is where portfolios live. *This is the new tenant root for
  commercial concerns.*

- **Business** — a *brand / operating unit* of a given **Business Type**
  (Restaurant, Cafe, Vape Shop, Retail…). A Business owns a catalog, a website,
  loyalty, marketing, and a set of **enabled capabilities/modules**. **The
  existing `Restaurant` row maps 1:1 onto a Business.** *This is the new tenant
  root for operating concerns.*

- **Location** — a *physical (or virtual) place* where a Business operates:
  address, hours, inventory, taxes, QR/tables, fulfillment options, KDS. A
  Business has **one or many** Locations. *This is the new root for
  place-specific concerns.* Today's single `lat/lng/address` becomes the
  business's **first/default Location**.

- **Membership** — a *scoped grant*: "User U has Role R over Scope S." Scope can
  be an Organization, a Business, or a specific Location. Replaces the flat,
  single-restaurant `User.restaurantId` + global role. *This is the plane that
  answers "who can do what, where."*

- **Tenant Context** — the *resolved runtime identity* of a request: which
  Organization / Business / Location this request acts within, and what the
  actor is allowed to do there. Every read/write, every AI call, every
  analytics query is evaluated **inside** a Tenant Context. *This is the plane
  that answers "which tenant is this, right now."*

### 2.2 The complete hierarchy

```
Organization                         (billing • team • portfolio • plan)
 ├── Business  (type: RESTAURANT)     (brand • catalog • website • capabilities)
 │    ├── Location A                  (place • hours • inventory • KDS • QR)
 │    ├── Location B
 │    └── Location C
 │
 ├── Business  (type: VAPE_SHOP)      (different capabilities: age-verify, etc.)
 │    └── Location A
 │
 └── Business  (type: RETAIL_STORE)
      ├── Location A
      └── Location B

Cross-cutting planes (attach at the right level):
   Membership   →  { User × Role × Scope(Org|Business|Location) }
   Capabilities →  attached to Business (derived from Business Type + plan)
   Tenant Context → resolved per request from auth + route + membership
   Billing      →  attached to Organization (with per-Business/plan entitlements)
   AI / Analytics → operate within Tenant Context, aggregate up the spine
```

### 2.3 Why three levels (not one, not five)
- **One level (today)** conflates account, brand, and place — the source of
  every limitation in §1.
- **Two levels** (Business → Location) would still have nowhere to hang billing
  and portfolios for multi-brand operators.
- **Four+ levels** (e.g., Region between Business and Location) is premature —
  add it later *within* this frame if enterprise franchise demands it. The
  spine is designed so intermediate levels can be inserted without reshaping.

Three levels is the **minimum** structure that cleanly separates **who pays**
(Organization), **what operates** (Business), and **where it happens**
(Location) — the exact separation Shopify (Org/Shop/Location), Square
(Business/Location), and Toast (Restaurant Group/Restaurant) all converged on.

---

# SECTION 3 — Business Model Design (conceptual)

Entities and their relationships, described conceptually (no schema).

### 3.1 Entities
| Concept | Role in the model | Maps from today |
|---|---|---|
| **Organization** | Commercial root; billing + team + portfolio owner | *new* (auto-created around each existing owner) |
| **Business** | Operating unit of a Business Type; owns catalog/site/capabilities | **= existing `Restaurant`** |
| **Business Type** | Classifier that seeds default capabilities/modules & vocabulary | **= existing `BusinessType` enum**, evolved |
| **Location** | Physical/virtual place; hours, inventory, fulfillment, KDS | existing `Restaurant.lat/lng/address/hours` → first Location |
| **Member** (Membership) | Scoped role grant (User × Role × Scope) | existing `User.restaurantId` + `Role` → one Membership |
| **Role** | Named permission set, evaluated within a Scope | existing global `Role` enum, expanded & scoped |

### 3.2 Relationships (cardinalities)
- **Organization 1 — N Business.** An org holds one or many businesses.
  (Today's 1:1 owner↔restaurant becomes the trivial case: 1 org, 1 business.)
- **Business N — 1 Business Type.** Each business has exactly one type; the type
  seeds its default capabilities.
- **Business 1 — N Location.** Each business has one default Location and may
  add more. (Today: exactly one.)
- **Organization 1 — N Membership**, **Business 1 — N Membership**,
  **Location 1 — N Membership.** A Membership binds a **User** to a **Role** at
  a **Scope** (Org, Business, or Location).
- **User N — N (Org/Business/Location) via Membership.** A user can belong to
  many scopes with different roles (co-owner of Org, Manager of Location B).
- **Business 1 — N Capability grant** (see §5), derived from Business Type +
  plan entitlements + explicit toggles.

### 3.3 The single most important invariant
> **`restaurantId` never dies. It is *reinterpreted* as `businessId`.**

The physical scoping key that 94 references depend on keeps working unchanged.
Conceptually we stop calling it "the restaurant" and start calling it "the
business," and we introduce `organizationId` (above it) and `locationId` (below
it) as **new, additive** keys. Existing data reads as: *one Organization
wrapping one Business (`= restaurant`) with one Location.* No row is orphaned,
no key is renamed on day one.

---

# SECTION 4 — Business Types (scalable classification)

### 4.1 The problem with a flat enum
Today `BusinessType` is a flat enum (`RESTAURANT, COFFEE_SHOP, DELI, VAPE_SHOP,
CONVENIENCE_STORE, BAKERY, PIZZA, RETAIL, OTHER`). Flat enums don't express
**families** ("Pizza Shop *is a* Restaurant"), don't carry **defaults**
("restaurants get a Kitchen module"), and force a code change for every new
vertical.

### 4.2 The model: Type Family → Type → (optional) Sub-type, driving Capabilities
Business Type becomes a **classification that maps to a capability profile**,
not a branch in code:

```
Type Family: FOOD_SERVICE
  ├── Restaurant
  │     ├── Pizza Shop
  │     ├── Burger / Fast Food
  │     └── Fine Dining
  ├── Cafe
  ├── Bakery
  └── Deli

Type Family: CONVENIENCE_RETAIL
  ├── Vape / Smoke Shop      (adds Age Verification)
  ├── Convenience Store
  └── Retail Store

Type Family: (future) SERVICES / GROCERY / SPECIALTY ...
```

Each **Business Type** points to a **default capability profile** — the set of
modules turned on when a business of that type is created. Sub-types refine the
profile and the *presentation* (a Pizza Shop defaults to size/topping modifier
scaffolding; Fine Dining defaults to reservations-leaning UX) **without a
separate codebase**.

### 4.3 Capability profiles by type (illustrative)
| Business Type | Default-ON modules (beyond the universal core) |
|---|---|
| Restaurant / Pizza / Burger / Fast Food | Commerce, Website, **Kitchen (KDS)**, Delivery, Loyalty, Marketing, AI |
| Fine Dining | Commerce, Website, Kitchen, **Reservations***, Loyalty, Marketing, AI |
| Cafe / Bakery | Commerce, Website, Kitchen (light), Loyalty, Marketing, AI |
| Deli | Commerce, Website, Kitchen (light), Inventory, Loyalty |
| Vape / Smoke Shop | Commerce, Website, **Age Verification**, **Inventory**, Loyalty, Marketing |
| Convenience Store | Commerce, Website, **Inventory**, Loyalty, Marketing |
| Retail Store | Commerce, Website, **Inventory**, **Shipping/Fulfillment**, Loyalty, Marketing |
| Future type | Composed from existing modules; **no new codebase** |

\* modules marked new (Reservations, Age Verification, Inventory-as-first-class,
Shipping) are **future** capabilities — listed to show the frame absorbs them;
this document does not build them.

### 4.4 Design rule
> **A new business type must be a *configuration* (a type + a capability
> profile), never a new codebase or a new tenant model.** If adding "Florist"
> or "Barbershop" one day requires touching the commerce engine, the
> abstraction has failed. The goal: onboarding a new vertical is a
> **data/profile** change plus, at most, additive modules — the spine and the
> engine stay put.

---

# SECTION 5 — Module (Capability) System

### 5.1 Concept
A **Capability** (a.k.a. Module) is a **named, toggleable unit of platform
functionality** that a Business either has or doesn't. Capabilities are the
seam between "one codebase" and "many verticals": the code for every module
ships to everyone; **which modules are active for a given Business** is
data-driven.

### 5.2 Two tiers of modules
- **Universal core (always on, every business):** Commerce, Website/Storefront,
  Customer Accounts, Payments, Analytics (baseline), Domains. These are the
  existing, proven engine and are never gated off.
- **Optional/vertical modules (enabled by type + plan):** Kitchen (KDS),
  Delivery, Loyalty, Coupons, Marketing/Automation, AI Consultant, Inventory,
  **Age Verification**, **Reservations**, **Shipping**, POS integrations.

### 5.3 Example capability catalog
| Module | What it governs | Typical enablers |
|---|---|---|
| **Commerce** | Catalog, cart, checkout, orders, tax/fees | Core (all) |
| **Website** | Generated storefront, themes, SEO, domains | Core (all) |
| **Loyalty** | Points, tiers, rewards | Food + retail, plan-gated |
| **Inventory** | Stock levels, low-stock, per-location counts | Retail, convenience, vape, deli |
| **Kitchen (KDS)** | Order routing to kitchen, prep, financial firewall | Food service |
| **Delivery** | DaaS dispatch (Uber Direct / DoorDash Drive), tracking | Food + retail (shipping variant) |
| **Age Verification** | ID/age gates at checkout, restricted-item rules | Vape/smoke, restricted retail |
| **Marketing** | Campaigns, automations, segments, SMS/email | Growth+ plans |
| **AI** | Menu/catalog import, brand/site gen, Business Consultant | Type-aware, plan-gated |

### 5.4 How enabling works (conceptually)
1. A Business is created with a **Business Type**.
2. The type's **default capability profile** seeds the initial ON/OFF set.
3. The Organization's **plan/entitlements** (billing) can raise or cap what's
   available (e.g., AI Consultant only on Pro).
4. An **owner/admin toggle** can turn optional modules on/off within what the
   plan allows.
5. At runtime, a **capability check** (part of Tenant Context) decides whether a
   route/UI/AI-tool is available — analogous to today's `requireRole`, but for
   *features* rather than *people*.

### 5.5 Why this beats per-vertical branching
- **One codebase, tested once.** No `if (businessType === 'VAPE')` scattered
  through the engine — instead, "does this Business have the `age_verification`
  capability?" resolved in one place.
- **New verticals = new profiles**, not new modules (usually).
- **Plans map cleanly to capabilities**, so billing and features share one
  language (see §8).
- **Graceful degradation:** the existing engine already treats
  delivery/SMS/POS providers as registries with `implemented` flags — the
  capability system is the natural generalization of that pattern the repo
  already uses.

---

# SECTION 6 — Multi-Location Architecture

### 6.1 Structure
```
Organization
 └── Business (brand: "Joe's Pizza", type RESTAURANT)
      ├── Location A  (Downtown)   — own hours, inventory, taxes, QR/tables, KDS
      ├── Location B  (Uptown)
      ├── Location C  (Airport)
      └── Location D  (Ghost kitchen)
```

### 6.2 What belongs at which level
| Concern | Level | Rationale |
|---|---|---|
| Brand, catalog (master), website, loyalty program, marketing | **Business** | Shared identity and customer relationship across places |
| Hours, address/geo, **inventory counts**, tax profile, fulfillment options, QR/tables, KDS, staff rota | **Location** | Varies physically per place |
| Billing, plan, team roster, portfolio analytics | **Organization** | Commercial + cross-business |
| Orders, payments, customers | **Business + Location** | Order is placed *at* a Location but belongs to the Business's customer/loyalty graph |

**Catalog nuance:** the **master catalog** lives at the Business; **availability
and stock** are per-Location. This lets "Uptown is out of pepperoni" coexist
with "the menu is one brand."

### 6.3 Ownership & permissions across locations
- A **Membership scoped to the Business** grants access to *all* its Locations
  (e.g., Owner, Business Admin).
- A **Membership scoped to a single Location** grants access to *only* that
  place (e.g., "Manager — Uptown," "Kitchen — Airport"). This is the capability
  today's flat role model cannot express.
- **Rollups** (revenue, top items, peak hours) aggregate **up** the spine:
  Location → Business → Organization, always evaluated inside Tenant Context.

### 6.4 The single-location default (backward compatibility)
Every existing restaurant becomes a Business with **exactly one Location**
(its current address/hours). Owners who never add a second Location see **no
change** — the Location layer is invisible until used. Multi-location is an
*opt-in expansion*, not a forced migration.

---

# SECTION 7 — Membership & Permissions

### 7.1 The model
A **Membership** = **User × Role × Scope**, where Scope ∈ {Organization,
Business, Location}. Permissions are the **intersection** of (what the Role
allows) and (what the Scope covers) and (what the Business's capabilities
expose).

### 7.2 Role set (superset of today's three)
| Role | Typical scope | Access boundary (intent) |
|---|---|---|
| **Owner** | Organization | Everything in the org: all businesses, all locations, billing, team. The account principal. |
| **Admin** | Organization or Business | Full operational control of its scope; may manage members below it; **no billing** unless also Owner. |
| **Manager** | Business or **Location** | Day-to-day ops for its scope: orders, menu/catalog, staff scheduling; no billing, no destructive org actions. |
| **Staff** | Location | Operate orders/POS for that location; limited catalog edits; no financial settings. |
| **Kitchen** | Location | **KDS only — order tickets, prep status. Never sees money/financials** (the blueprint's "financial firewall"). |
| **Marketing** | Business | Campaigns, automations, segments, content; read-only on orders/analytics; no operational or financial control. |
| **Support** | Organization or Business | Read-mostly access to orders/customers to resolve issues; no settings/billing/destructive actions. |

### 7.3 Access boundaries (principles)
1. **Scope contains permission.** A Location-scoped Manager cannot touch a
   sibling Location. A Business-scoped Admin cannot touch a sibling Business.
2. **Money is a distinct boundary.** Financial visibility (revenue, payouts,
   billing) is gated *independently* of operational access — Kitchen and
   Marketing operate fully without ever seeing money.
3. **Billing is Owner-only** (Organization scope), separated from operational
   Admin.
4. **Capabilities gate features, roles gate actions.** A Marketing member in a
   Business without the Marketing capability sees nothing to do; a role never
   grants access to a disabled module.
5. **Least privilege by default.** New members get the narrowest scope that
   fits; elevation is explicit.

### 7.4 Relationship to today
The current `RESTAURANT_OWNER` becomes **Owner @ Organization**;
`RESTAURANT_STAFF` becomes **Staff @ Location**; platform `ADMIN` becomes a
**platform-super-admin** concept distinct from tenant roles. Existing users map
onto exactly one Membership at conversion time — lossless.

---

# SECTION 8 — Tenant Isolation Impact

The move from `restaurantId`-only to an Org/Business/Location spine changes the
isolation story in every cross-cutting system. The guiding rule: **isolation is
evaluated within Tenant Context, and Tenant Context is resolved once per
request.**

- **Security & Tenant Isolation.** Today isolation is a single key
  (`restaurantId`) enforced in app code. Tomorrow the **Business** remains the
  primary isolation boundary (so the proven scoping keeps working), with
  **Location** as a sub-scope and **Organization** as a super-scope for
  cross-business rollups. This is the ideal moment to introduce
  **database-enforced isolation (RLS / equivalent)** keyed on the Business
  (== today's `restaurantId`) — the audit's #1 risk — because the key doesn't
  change, only its *name and framing* do. Cross-org/cross-business leakage must
  be **structurally impossible**, not merely code-avoided.

- **Billing.** Moves to the **Organization** — the natural home for a
  subscription that spans multiple Businesses/Locations. Entitlements
  (plan → capabilities/quotas) flow *down* the spine to gate modules per
  Business. This finally gives the "no billing system" gap (audit §J1) a
  correct place to live.

- **Marketing.** Scoped to the **Business** (the customer relationship lives
  with the brand, not a single place), but **segmentable by Location**
  ("customers of the Airport location"). Consent/TCPA ledgers attach to the
  customer within the Business's isolation boundary.

- **AI.** Every AI call runs **inside Tenant Context** — scoped to a Business
  (and optionally a Location), never able to see another tenant's data. This
  generalizes the blueprint's "tenant-scoped AI" requirement: the scope object
  the AI is handed *is* the Tenant Context, and per-tenant **AI cost/quota**
  attaches to the Organization's plan.

- **Analytics.** Becomes **hierarchical by design**: metrics compute at
  Location, roll up to Business, roll up to Organization. Today's
  single-restaurant analytics becomes the "one Business, one Location" base
  case, unchanged for existing users, but now extensible to portfolio dashboards
  without reshaping queries.

---

# SECTION 9 — Migration Strategy (additive evolution only)

**Non-negotiable:** nothing destructive. No renamed columns on day one, no
dropped tables, no rewritten commerce flows, no broken websites, no touched
customer data. The strategy is **reinterpret + wrap + expand**.

### 9.1 The core move: reinterpret, don't rename
- Treat the existing **`Restaurant` as a Business** and its
  **`restaurantId` as the Business scope key** — *by convention first, in code
  and docs*, long before any physical rename. The 94 references keep compiling
  and passing tests because nothing about them changes.

### 9.2 Additive layering (each step independently shippable)
1. **Introduce Organization above** each existing restaurant: auto-create one
   Organization per current owner, wrapping their one Business. Existing owner →
   Owner Membership @ Organization. (New tables/relations only; existing FKs
   untouched.)
2. **Introduce Location below** each Business: create one default Location per
   Business from its current `address/lat/lng/hours`. Place-specific data
   (hours, tables, KDS, inventory) *continues to read from the Business* until
   features opt into the Location layer — the Location starts as a mirror, not a
   migration.
3. **Introduce Membership** as the new access model; **back-fill** one
   Membership per existing `User.restaurantId` + `Role`. Keep the old fields
   readable during a **dual-read** period so no API breaks.
4. **Introduce Capabilities**: seed each Business's capability profile from its
   `BusinessType`. Default every existing restaurant to the "restaurant profile"
   so behavior is identical on day one.
5. **Introduce Tenant Context resolution** as a thin layer that, for legacy
   requests, resolves to `{ org: auto, business: restaurantId, location:
   default }` — a pure superset of today's behavior.

### 9.3 Backward-compatibility guarantees
- **Existing tables:** only *added to* (new nullable columns / new join tables /
  new sibling tables). Never renamed or dropped in an additive step.
- **Existing APIs:** `/api/restaurants/:restaurantId/...` continue to work; new
  `/api/businesses/:businessId/...` (and org/location routes) are **aliases**
  that resolve to the same Business. Deprecate the old routes only after clients
  migrate — if ever.
- **Existing commerce flows:** untouched — Commerce is a universal core module;
  the engine keeps running against the Business scope (== `restaurantId`).
- **Existing websites:** render from the same Business/site data; the Location
  layer is invisible to single-location sites.
- **Existing customer data & dashboard:** zero data migration required to *keep
  working*; new structure is layered *around* it.

### 9.4 The eventual (optional) physical rename
A literal `restaurantId → businessId` column rename is a **late, optional,
purely cosmetic** step — done only once every consumer reads through the new
naming, behind an additive alias, with a reversible plan. It is **not** required
for any BOS capability. The system is fully multi-vertical *before* any rename
happens.

> **Principle:** *Every step leaves the platform shippable and reversible. At no
> point does the restaurant that exists today stop working.*

---

# SECTION 10 — Recommended Database Shape (high-level concepts only)

*No Prisma, no SQL, no code. Concepts and relationships only.*

- **Organization** — commercial root. Holds: identity, billing/subscription
  linkage, plan, team roster pointer. **One per account.**
- **Business** — operating unit under an Organization. Holds: name/brand,
  **Business Type**, capability profile, links to catalog/website/loyalty/
  marketing. **This is the conceptual home of today's `Restaurant`.** Carries an
  **`organizationId`** (new, up) and *is* the target of today's `restaurantId`
  (unchanged, the scope key).
- **Location** — place under a Business. Holds: address/geo, hours, tax profile,
  fulfillment options, QR/tables, KDS config, per-location inventory linkage.
  Carries a **`businessId`**. Every Business has a **default Location**.
- **Business Type** — classification (family → type → optional sub-type) that
  maps to a **default capability profile**. Evolves today's `BusinessType`
  enum; kept referentially compatible.
- **Capability / Module grant** — the ON/OFF (and plan-bounded) set of modules
  per Business. Conceptually a set attached to Business, derived from Type +
  plan + explicit toggles.
- **Membership** — the scoped access grant: **User × Role × Scope**, where Scope
  references an Organization, a Business, or a Location. Replaces flat
  `User.restaurantId` + global `Role` (which remain readable during transition).
- **Billing/Subscription** — attached to Organization; entitlements resolve to
  capabilities/quotas per Business. (Design placeholder — this document defines
  *where it hangs*, not its internals.)
- **Tenant Context** — not a stored table but a **resolved runtime object**:
  `{ organizationId, businessId, locationId?, memberships, capabilities }`,
  derived per request. The single object every query/AI/analytics call is
  evaluated against.

**Relationship summary (conceptual):**
`Organization 1–N Business`, `Business N–1 BusinessType`,
`Business 1–N Location`, `Business 1–N Capability-grant`,
`(Org|Business|Location) 1–N Membership`, `User 1–N Membership`.
Legacy identity: *existing Restaurant ≙ Business; existing owner ≙ Owner
Membership @ auto-Organization; existing address ≙ default Location.*

---

# SECTION 11 — Risks

### 11.1 Architectural risks
- **Over-abstraction.** A capability/module system can become a maze if every
  behavior becomes a toggle. *Mitigation:* keep the **universal core** truly
  core (never gated), and gate only genuinely optional/vertical modules.
- **Scope explosion in permissions.** User × Role × (Org|Business|Location) is
  powerful but can become hard to reason about. *Mitigation:* a small, fixed
  role set (§7), least-privilege defaults, and a single Tenant-Context
  resolution point rather than ad-hoc checks.
- **Vocabulary leakage.** Restaurant terms are embedded in data and UI;
  half-renaming creates confusion. *Mitigation:* decide terminology once (§12),
  reinterpret consistently, and rename physically only late and wholesale.

### 11.2 Migration risks
- **Dual-read/dual-write windows** (legacy `restaurantId` + new spine) are
  where subtle bugs hide. *Mitigation:* legacy path resolves to a strict
  *superset* of old behavior; extensive tests already exist to guard commerce.
- **Back-fill correctness** (one Org/Location/Membership per existing
  restaurant). *Mitigation:* deterministic, idempotent back-fill; verify counts
  match 1:1 before enabling new paths.

### 11.3 Backward-compatibility risks
- **API consumers** (web app, storefronts) assume `restaurantId` routes.
  *Mitigation:* new routes are aliases; old routes never removed without a
  deprecation window.
- **`ownerId @unique`** currently *enforces* 1:1 ownership; relaxing it is a
  schema change and must be **purely additive** (introduce Membership as the
  real source of truth; leave the old relation intact until unused).
- **Websites & customer accounts** must render/behave identically for
  single-location businesses. *Mitigation:* Location layer invisible until
  opted into.

### 11.4 Performance risks
- **Deeper hierarchy = more joins** (Org→Business→Location) on hot paths.
  *Mitigation:* keep **Business** as the primary hot-path scope key (unchanged
  from today), resolve Tenant Context once and cache it per request, and make
  Org/Location joins lazy (only when a feature needs them).
- **Rollup analytics** across many locations/businesses can be heavy.
  *Mitigation:* compute at the lowest level and aggregate; consider read models
  later — not part of this foundation.
- **Capability checks on every request.** *Mitigation:* resolve the capability
  set into Tenant Context once per request, not per query.

---

# SECTION 12 — Final Recommendation

### 12.1 Recommended terminology (adopt platform-wide, in docs/code first)
| Use this | Instead of | Meaning |
|---|---|---|
| **Organization** | (none today) | Account / billing / portfolio root |
| **Business** | "Restaurant" (as a tenant) | Operating brand of a Business Type |
| **Location** | "the restaurant's address" | A physical/virtual place of a Business |
| **Member / Membership** | "staff" / `User.restaurantId` | Scoped role grant |
| **Business Type** | flat `BusinessType` enum | Family → Type → Sub-type classifier |
| **Capability / Module** | (implicit "everyone gets everything") | Toggleable unit of functionality |
| **Tenant Context** | ad-hoc `restaurantId` scoping | Resolved per-request tenant identity |

Keep "Restaurant" only as a **Business Type label** and in the KDS/kitchen
domain where it is genuinely food-specific. Everywhere it means "the tenant,"
say **Business**.

### 12.2 Recommended architecture (one sentence)
> A three-level tenant spine — **Organization → Business → Location** — with two
> cross-cutting planes — **Membership** (scoped roles) and **Capabilities**
> (type/plan-driven modules) — all resolved per request into a **Tenant
> Context**, with the existing commerce engine preserved and the existing
> `Restaurant`/`restaurantId` reinterpreted as **Business**/business-scope.

### 12.3 Recommended evolution path (additive, reversible, non-destructive)
1. **Adopt the vocabulary and the Tenant-Context concept** in code/docs — no
   schema change. (Frame first.)
2. **Add Organization above** (auto-wrap existing owners).
3. **Add Membership** (back-fill from `restaurantId` + `Role`; dual-read).
4. **Add Capabilities** (seed from `BusinessType`; everyone defaults to
   restaurant profile — zero behavior change).
5. **Add Location below** (mirror the current single address; invisible until
   used).
6. **Introduce DB-enforced isolation (RLS/equivalent)** keyed on Business
   (== `restaurantId`) — the audit's #1 risk, closed while the key is stable.
7. **Expand:** multi-location, multi-business ownership, new Business Types as
   *profiles*, new modules (Age Verification, Inventory-first, Reservations,
   Shipping) as *additive capabilities*.
8. **(Optional, late)** physical `restaurantId → businessId` rename behind
   aliases.

### 12.4 Recommended implementation order (dependency, not dates)
> **Terminology & Tenant Context → Organization → Membership → Capabilities →
> Location → DB-enforced isolation → Billing @ Organization → multi-location &
> multi-business expansion → new verticals as profiles/modules.**

Billing (the audit's biggest production blocker) slots in **after** Organization
exists (its natural home) and **alongside** Capabilities (which entitlements
gate) — turning the foundation into revenue as early as structurally honest.

### 12.5 The mandate, restated
Do not think like a restaurant platform. Think **Shopify + Square + Toast +
HubSpot**: an Organization owns Businesses, Businesses run at Locations, teams
hold scoped Memberships, and every business type is the **same engine wearing
different capabilities**. OrderVora already has the engine. This foundation
gives it the **frame** — additively, safely, and once — so that every feature
for the next five years hangs off Organization → Business → Location instead of
off a single `restaurantId`.

---

*End of Business OS Foundation. This document defines the frame only; it builds
nothing. Implementation is sequenced in `MASTER_EXECUTION_SEQUENCE.md` and gated
by the decisions in `PHASE_1_FOUNDATION_COMPLETION_PLAN.md`.*
