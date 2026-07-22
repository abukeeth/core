# OrderVora Roadmap

## Completed

### Core Platform
- Authentication
- Restaurant/business foundation
- Menu system
- Ordering flow
- Checkout
- Payments foundation
- Dashboard foundation
- KDS foundation

### Sprint 18 — Owner Experience Foundation (complete)
- Part 1: Owner auth foundation (password reset, email verification, Remember Me, logout-all, profile) — completed
- Part 2: Business Setup Wizard — completed
- Part 3: Launch Center — completed
- Part 4: Test Order Flow — completed
- Part 5: Import Processing UX (bulk review actions, multi-photo upload, named progress stages, business-profile retheme) — completed
- Part 6: Website Preview UX (preview/publish chain retheme, real generation progress) — completed
- Part 7: Final Mobile UX Review (mobile "More" navigation, page-shell spacing/overflow fixes, Orders page mobile polish) — completed

### Sprint 19 — Design System Foundation & Orders Module (complete, then scope change — see `RELEASE_NOTES.md`)
### Sprint 19A — AI Import Experience + live UX validation pass (complete)
### Sprint 19B — Premium header/navigation, unified mobile layout, production-readiness fixes (Parts 1-3, complete)
### Sprint 20A — AI Website Studio (Tasks 1-5, complete; Task 6 not started)
- Task 1: AI Website Studio foundation — completed
- Task 2: AI Brand Concepts experience — completed
- Task 3: real Website Publishing Engine — completed
- Task 4: Temporary Domain & Custom Domain Engine — completed
- Task 5: Website Customization Studio — completed, **latest completed task**

See `RELEASE_NOTES.md` for full detail on each sprint/part/task (including verification results and known limitations) and `PROJECT_MEMORY.md` for current-state context.

## Current Focus

Sprint 20A Task 5 is the latest completed work; Sprint 20A Task 6 was
never started. Next up, in priority order per `CLAUDE.md` (production
stability > existing feature completion > UX > new features):

- Retheme the remaining dashboard pages still on the pre-Sprint-18
  dark/zinc styling (Orders, Menu, Kitchen, Staff, Payments, Coupons,
  Loyalty, Referrals, Tables, Delivery, Driver, Kitchen Capacity, POS,
  Restaurant, Profile, and the manual Website Hub's Editor/Messages/Score
  pages) onto the warm cream/gold system — Sprint 18 fixed these pages'
  mobile *structure* (nav reachability, bottom-nav clearance, overflow)
  but explicitly left their visual redesign for later, larger work; check
  `RELEASE_NOTES.md` for whether any of it has since been picked up.
- Decide whether `/dashboard/website/*` (manual Website Hub) and
  `/dashboard/builder/*` (orchestrated AI Builder) should be
  consolidated into one flow, or kept as primary/secondary paths.
- Sprint 20A Task 6 (scope not yet defined — Sprint 20A stopped at Task 5
  per instruction).

## After Sprint 18

### Product Design Upgrade

- Owner dashboard redesign
- Business Control Center
- Premium mobile experience
- Figma to React implementation

### Monetization

Subscription plans:

Starter
$99/month

Growth
$189/month

Pro
$295/month

Enterprise
Custom pricing

## Future Platform Expansion

- AI Restaurant Assistant
- AI Menu Builder
- AI Marketing
- Customer mobile app
- Owner mobile app
- POS integrations
- Delivery integrations
- Multi-location management

## Launch Goal

Move from beta platform to production-ready SaaS with pilot restaurants.

## Launch-Critical Sprint (2026-07-22) — complete

- SaaS Billing MVP: STARTER plan, 14-day free trial, Stripe Billing
  (Checkout/portal/webhook), subscription status, feature gating behind
  BILLING_ENFORCEMENT_ENABLED — completed
- Super Admin MVP: users, businesses (+subscription state), cross-tenant
  orders/payments, suspend + permanent delete, audit-logged — completed
- First real production payment: runbook ready
  (docs/runbooks/first-live-payment.md); execution requires owner's live
  Stripe account — pending owner action
