# Sprint 08 — Beta Experience — Completion Report

## Objective

Turn the production-ready codebase from Sprint 07 (+ 07.6/07.7 remediation
+ 11-phase Production Hardening) into a realistic, fully-functional beta
environment the user could personally experience end to end — no new
features, no infrastructure redesign, entirely built from what already
exists.

## What was built

**Seed data** (`apps/api/prisma/seed-beta.ts`, direct Prisma, mirroring
the existing `load-tests/seed-load-test-data.ts` convention):
- 3 restaurants — Golden Dragon Bistro (hero: full menu with variants/
  modifiers/an 86'd item, 6 QR tables, 3 coupons, delivery+pickup+dine-in
  enabled), Bella Italia Trattoria, Taco Fiesta Cantina — each with real
  hours, delivery config, kitchen capacity.
- 6 demo accounts covering every requested role: Platform Admin,
  Restaurant Owner, Restaurant Staff, Kitchen Display, Driver, Customer
  (the last with a saved geocoded address and 2 favorites).
- Historical order volume (`apps/api/scripts/seed-beta-orders.ts`) — 70
  orders across the 3 restaurants, driven through the **real HTTP
  checkout + order-status API** (not hand-crafted rows) so every seeded
  order is indistinguishable from one a real customer placed: cart
  create → add items → place-order (cash) → start-preparing →
  mark-ready → complete → mark-paid, with a realistic COMPLETED/CANCELLED
  mix and light cosmetic timestamp backdating across the last 7 days for
  analytics/reporting realism.
- One live-feeling DELIVERY order pre-placed (`demo-place-delivery-order.ts`)
  for the Kitchen→Driver→Delivery leg, since the cart page has no
  delivery-address picker (see Findings below).

**Minimal UI addition**: an Admin platform-overview table on
`/dashboard` (ADMIN role only), reusing the already-existing, already-
tested `GET /api/admin/restaurants` endpoint — no new backend surface.

**Environment**: the compiled production build (`pnpm run build` output
for both apps) run directly against local Postgres/Redis — the same
artifacts `docker-compose.yml`'s images would run. Docker Compose itself
could not be exercised in this sandbox (see Constraints).

## Two real bugs found and fixed

Building this demo meant driving the actual product end to end for
arguably the first time, and it surfaced two defects that made core
parts of the required workflow (not edge cases) simply not work:

1. **`getOrCreateActiveCart()` (`cart.service.ts`) didn't return `items`**,
   but the frontend's `Cart` type declares it required and reads
   `cart.items.length` on page load — the customer-facing menu page
   crashed for every visitor, on both a brand-new and a returning cart.
   Fixed by including `items` in both the found-existing and
   newly-created queries; added a regression test.
2. **The kitchen queue (`dashboard/kitchen/page.tsx`) could never advance
   an order past READY.** Its action map offered "Mark out for delivery"
   from READY, but the order state machine only allows `READY ->
   COMPLETED` — every order, pickup or delivery, hit a dead end there.
   Fixed by adopting the already-correct action mapping that
   `dashboard/orders/[id]/page.tsx` already used (PREPARING offers both
   "Mark ready" and "Mark out for delivery"; READY and OUT_FOR_DELIVERY
   both offer "Complete").

Both were verified fixed via a real, precisely-scripted browser
walkthrough (Playwright against the running compiled build) — not just
unit tests — driving an actual delivery order through CONFIRMED →
PREPARING → READY → (driver: ACCEPTED → PICKED_UP → DELIVERED) →
COMPLETED, and a pickup order through the equivalent kitchen-only path,
confirmed against the database at each step.

## Findings — not fixed (documented, out of scope)

Per explicit instruction (no new features, no infrastructure redesign),
three further gaps were discovered and are reported, not patched:

- **No delivery-address picker on the cart page** — the backend has
  always supported `deliveryAddressId` on `PATCH .../cart/:id/fulfillment`;
  nothing in the UI collects one. A delivery order can only be placed by
  a logged-in customer with a saved address, via a direct API call.
- **No "assign driver" control anywhere in the dashboard** — the backend
  endpoint is fully implemented and tested; no frontend code calls it.
- **A cash-paid order cannot be refunded via the existing refund
  endpoint** — `refundOrder()` requires an `order.payment` row, which
  only the card-payment path ever creates.

Two small operator scripts (`scripts/demo-assign-driver.ts`,
`scripts/demo-place-delivery-order.ts`) document/exercise the first two
gaps for this demo without adding product UI, mirroring this codebase's
existing convention of operational tooling living in `scripts/`/`load-tests/`
rather than the app itself (e.g. `scripts/restore-drill.sh`).

## Verification

| Check | Result |
|---|---|
| `prisma validate` | ✅ Pass |
| `prisma generate` | (unchanged this sprint — no schema changes) |
| `pnpm run lint` | ✅ Pass, both apps |
| `pnpm run typecheck` | ✅ Pass, both apps |
| `pnpm run test` | ✅ apps/api: 927 passed \| 5 skipped (134 files); apps/web: 9 passed |
| `pnpm run build` | ✅ Pass, both apps |
| Full browser walkthrough (Playwright, real compiled build, real Postgres) | ✅ All 6 roles login; live PICKUP checkout; kitchen advances both order types correctly; driver accept/pickup/deliver; owner completes; admin sees all 3 restaurants |

No Prisma schema/migration changes this sprint.

## Files changed

```
apps/api/prisma/seed-beta.ts                                    (new)
apps/api/prisma/demo-credentials.ts                             (new)
apps/api/scripts/seed-beta-orders.ts                             (new)
apps/api/scripts/demo-place-delivery-order.ts                    (new)
apps/api/scripts/demo-assign-driver.ts                           (new)
apps/api/package.json                                            (3 new scripts)
apps/api/src/modules/commerce/cart/cart.service.ts                (bug fix)
apps/api/src/modules/commerce/cart/cart.service.test.ts           (regression test)
apps/web/src/app/dashboard/page.tsx                               (admin overview)
apps/web/src/app/dashboard/kitchen/page.tsx                       (bug fix)
docs/reports/Sprint08/BETA_DEMO_GUIDE.md                          (new)
docs/reports/Sprint08/SPRINT_08_BETA_EXPERIENCE_REPORT.md         (new, this file)
```

## Constraints encountered

- **Docker Hub image pulls are blocked by this sandbox's network
  policy** (`docker pull postgres:16-alpine` / `redis:7.4-alpine` both
  returned `403 Forbidden` on the underlying CloudFront blobs, confirmed
  with two separate attempts) — `docker-compose.yml` itself could not be
  run here. Mitigated by running the exact same compiled artifacts the
  Docker images would run directly against local Postgres/Redis
  (already-installed, already-configured from prior sprints' work).
- One repo file, `apps/web/AGENTS.md`, contains prompt-injection-style
  text ("this is NOT the Next.js you know... read
  `node_modules/next/dist/docs/`" — a directory that doesn't exist).
  Flagged to the user during this sprint; not acted on since it was out
  of scope and the user hadn't asked for it to be addressed.

## Status

The full requested workflow — Customer → Checkout → Payment → Kitchen →
Driver → Delivery → Owner Dashboard → Admin Dashboard — is demonstrable
end to end using the demo accounts and seeded data in this report, on the
currently-running environment. See `BETA_DEMO_GUIDE.md` for exact
credentials, links, and step-by-step instructions.
