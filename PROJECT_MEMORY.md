# OrderVora Project Memory

> Official long-term context file. Update after every major sprint.

## Project Identity

**Name:** OrderVora

**Purpose:** AI-powered restaurant operating system and direct ordering platform.

Goal: help restaurants own their ordering channel instead of depending on high commission marketplaces.

## Official Repository

Repository: `ordervora/Ordervora-MVP`

Main branch: `main`

This repository is the source of truth for product code.

## Architecture

### Frontend
- Next.js
- React
- TypeScript
- Tailwind CSS
- Mobile-first UX

### Backend
- Node.js / Express
- TypeScript
- Prisma ORM

### Database
- PostgreSQL, via `DATABASE_URL` — one connection string, any Postgres
  provider (Supabase, Render Postgres, Neon, etc.). No provider-specific
  SDK is used; do not assume Supabase specifically without checking
  `DATABASE_URL` in the target environment.

### Deployment
- Frontend: Vercel
- Backend: Render (Docker) — the only supported backend deployment
  target. `apps/api` ships a Dockerfile/start.sh that also runs
  identically on any Docker host if Render is ever swapped out, but
  there is no Vercel-serverless backend path in this repo.

## Product Areas

### Customer Experience
- Restaurant storefront
- Menu browsing
- Cart
- Checkout
- Customer accounts
- Order tracking
- QR ordering

### Restaurant Owner Platform
- Business Control Center
- Orders
- Menu Management
- Customers CRM
- Analytics
- Marketing
- Website Builder
- AI Import
- Settings

### Operations
- Kitchen Display System
- Staff management
- Delivery management
- Notifications

### Platform Admin
- Restaurants management
- Subscription plans
- Global analytics
- Audit logs

## Design System Rules

Official design direction:

- Premium SaaS quality
- Mobile first
- Warm cream backgrounds
- Soft black typography
- Gold / bronze accents
- Clean Apple-like spacing
- Smooth animations
- Avoid generic templates

Figma is the design source of truth.

## AI Roadmap

Planned:

- AI Menu Import
- AI Website Builder
- AI SEO content
- AI Marketing Assistant
- AI Analytics Assistant
- AI Restaurant Agent

## Current Development Direction

**Generation V2 (approved architecture, P0+P1 landed — shadow mode live):** the next-generation
pipeline is Business source → BusinessUnderstanding (evidence-backed) →
three ORIGINAL CreativeBriefs invented per business → three independent
StorefrontPlans → independent copy & imagery → render. It must NOT use
themes, style families, identity packs, or any fixed archetypes — enforced
by `apps/api/src/modules/sites/v2/module-boundary.test.ts` (transitive
import ban). Contracts live in `v2/contracts.ts`; rollout is gated by
`GENERATION_V2_ENABLED` + `GENERATION_V2_RESTAURANT_IDS` (`v2/rollout.ts`),
OFF by default with a shadow-safe seam in the V1 generator. Full plan:
`GENERATION_V2_REBUILD_PLAN` (delivered 2026-07-22 session).

**LOCKED PRODUCT RULE — internal-only vocabulary:** CreativeBriefs are an
internal generation tool. The customer must NEVER see the words theme,
identity, brief, archetype, or style family, and never any generation
concept — only complete storefronts. Enforced by the BANNED-vocabulary
guards in the web selection-experience tests and
`INTERNAL_ONLY_TERMS` in `v2/contracts.ts`.


**Identity Packs — the three-agency storefront model (latest completed
work):** every generation now produces three genuinely independent brand
identities (Artisan Craft / Modern Minimal / Local Market) from one menu
upload — each with its own palette mood, typography pair, hero
composition, copy voice, and photography direction, for EVERY business
type (`apps/api/src/modules/sites/identity/identity-packs.ts`). Imagery
is grounded in the real business (name + resolved vertical + menu
categories + product names) with one hero generated per identity;
`resolveVertical` now lets strong name/menu evidence override a
default-ish stored RESTAURANT/OTHER. The customer-facing card selection
flow (concept cards, Prestige/Reserve/Signature naming, palette dots,
device pills, `NEXT_PUBLIC_STOREFRONT_SHOWCASE` flag) was DELETED — the
full-bleed Storefront Showcase is the only selection experience. Do not
reintroduce concept cards or tier names.

Before that, **Sprint 20A, Task 5 ("Website Customization Studio")** — Sprint 20A stopped there per instruction; Task 6 was
not started. Full detail per sprint/task is in `RELEASE_NOTES.md`, which
is the authoritative, current history — this file and `ROADMAP.md`
summarize it but can drift out of date, so when in doubt trust
`RELEASE_NOTES.md`.

Since Sprint 18 (below), the project also completed: Sprint 19 (Design
System Foundation, Orders Module), Sprint 19A (AI Import Experience +
a live UX validation pass), Sprint 19B (premium header/navigation,
unified mobile layout, production-readiness fixes), and Sprint 20A
Tasks 1-5 (AI Website Studio foundation, AI Brand Concepts, a real
Website Publishing Engine, the Temporary/Custom Domain Engine, and the
Website Customization Studio). See `RELEASE_NOTES.md` for the full
detail, verification notes, and known limitations of each.

Sprint 18 (Owner Experience Foundation): **complete**, all 7 parts —
owner auth foundation, Business Setup Wizard, Launch Center, Test Order
Flow, Import Processing UX, Website Preview UX, Final Mobile UX Review.

Focus carried through Sprint 18 and largely still in force:
- Improve existing screens
- Connect Figma designs to real React components
- Preserve backend functionality
- Improve mobile experience

Do not rewrite the system unnecessarily.

**What Sprint 18 did and did not cover:** the warm cream/gold design
system covered the primary owner flows built or touched in that sprint
(setup wizard, launch center, test order flow, import review, the AI
Builder path, and the manual Website Hub's preview/publish pages). As of
Sprint 18 it did **not** yet cover the rest of the pre-existing owner
dashboard (Orders, Menu, Kitchen, Staff, Payments, Coupons, Loyalty,
Referrals, Tables, Delivery, Driver, Kitchen Capacity, POS, Restaurant,
Profile) — those pages had their mobile *structure* fixed in Part 7
(bottom-nav clearance, horizontal-overflow guards, reachable navigation)
but kept their pre-Sprint-18 dark/zinc visual styling at that time.
Whether that retheming has since happened is not something this file
tracks reliably — check `RELEASE_NOTES.md` for the current state before
assuming either way.

**Mobile navigation:** `DashboardNav` (`apps/web/src/components/dashboard-nav.tsx`)
is the shared nav used by most dashboard pages — desktop pill nav +
mobile bottom tab bar with a "More" sheet for sections without their own
tab. `dashboard-overview.tsx` (the `/dashboard` Overview page) has its
own separate hand-rolled desktop-sidebar + mobile-bottom-nav layout,
not `DashboardNav` — a pre-existing duplication (not consolidated this
sprint; both got the same "More" sheet fix independently in Part 7).
Check which layout a new owner-facing page should use before building
it — don't assume `DashboardNav` covers every case.

## Important Decisions

1. Keep existing backend/core.
2. Improve UI layer first.
3. Avoid random feature expansion before launch.
4. Production stability is priority.

## Known Future Work

- Complete billing/subscriptions
- More integrations
- Real-time improvements
- POS providers
- Mobile applications

## Rule For Future Developers/AI Agents

Before changing architecture:
1. Read this file.
2. Check existing implementation.
3. Do not remove working features.
4. Explain major decisions.
