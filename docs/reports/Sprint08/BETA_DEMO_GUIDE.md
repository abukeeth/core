# Beta Demo Guide — Sprint 08

A walkthrough for personally experiencing the full Ordervora commerce
platform: Customer → Checkout → Payment → Kitchen → Driver → Delivery →
Owner Dashboard → Admin Dashboard, using seeded demo data and demo
accounts, running the same compiled production artifacts the Docker
images ship.

## Quick links (current running environment)

- Storefront: http://localhost:3000
- Golden Dragon Bistro menu (customer ordering): http://localhost:3000/order/60684f67-72e9-4cab-bfa4-0e54a90d6865
- Pre-placed DELIVERY order #41 waiting at CONFIRMED for the driver leg: id `7afe6db7-3a2d-4e02-a461-ff3af4826afa` (`/dashboard/orders/7afe6db7-3a2d-4e02-a461-ff3af4826afa` as the owner). Re-running `seed:beta:delivery-order` prints a fresh id each time.

## 1. Starting the environment

**Docker Compose could not be used to produce this running environment** —
this sandbox's network policy blocks Docker Hub image pulls (confirmed:
`docker pull postgres:16-alpine` and `redis:7.4-alpine` both returned
`403 Forbidden` on the image blobs). Instead, the exact same artifacts
`docker-compose.yml` would run — `pnpm run build`'s output — are run
directly against local Postgres/Redis:

```sh
# 1. Postgres + Redis running locally, migrations applied
cd apps/api && pnpm exec prisma migrate deploy

# 2. Seed the demo data (safe to re-run after truncating — see §6)
pnpm run seed:beta            # restaurants, menus, staff, coupons, tables, customer
pnpm run seed:beta:orders     # ~70 historical orders (cash, real HTTP checkout)
pnpm run seed:beta:delivery-order   # one fresh DELIVERY order (#41) ready to advance

# 3. Run the compiled API (same as `apps/api/Dockerfile`'s runtime stage)
node dist/src/index.js

# 4. Run the compiled web app (same as `apps/web/Dockerfile`'s runtime stage —
#    next build's standalone output doesn't bundle public/ or .next/static,
#    so they're copied alongside once, same as the Dockerfile does)
cd apps/web && pnpm run build
cp -r public .next/standalone/apps/web/public
cp -r .next/static .next/standalone/apps/web/.next/static
cd .next/standalone && PORT=3000 API_URL=http://localhost:4000 node apps/web/server.js
```

Open **http://localhost:3000**.

## 2. Demo accounts

All accounts share one password for this non-production demo database:

```
OrdervoraDemo!23
```

| Role | Email | Where to log in |
|---|---|---|
| **Platform Admin** | `admin@demo.ordervora.example` | `/login` → `/dashboard` (platform-wide restaurant overview) |
| **Restaurant Owner** (Golden Dragon Bistro) | `owner@goldendragon.demo` | `/login` → `/dashboard` |
| **Restaurant Staff** | `staff@goldendragon.demo` | `/login` → `/dashboard` |
| **Kitchen Display (KDS)** | `kitchen@goldendragon.demo` | `/login` → `/dashboard/kitchen` |
| **Driver** | `driver@goldendragon.demo` | `/login` → `/dashboard/driver` |
| **Customer** | `customer@demo.ordervora.example` | `/account/login` (has a saved delivery address near Golden Dragon Bistro, 2 favorites) |

Two additional restaurants exist for platform breadth (visible in the
Admin overview, each with their own order history) — not needed for the
main walkthrough, but browsable:

- **Bella Italia Trattoria** — owner: `owner@bellaitalia.demo`
- **Taco Fiesta Cantina** — owner: `owner@tacofiesta.demo`

## 3. The walkthrough

### Customer → Checkout → Payment (pickup, cash)

1. Go to `/order/<Golden Dragon Bistro's restaurant id>` (find the id via
   the Admin overview, or `owner@goldendragon.demo` → `/dashboard/restaurant`).
2. Add an item without variants/modifiers for the fastest path (e.g.
   "Hot & Sour Soup", "Potstickers", "Edamame") — items with size/sauce
   options open a selection modal first.
3. Go to the cart, click **Proceed to checkout**.
4. Fill in a name/email, select **Cash at pickup**, place the order.
5. You land on the confirmation page with a real order number.

This is a completely live round trip through the real checkout engine —
idempotency key, quote computation, order/fulfillment creation, the
works. Card payment is also visible on this screen but stays disabled
unless a restaurant connects a real Stripe account (BYOP — there's no
global demo Stripe key to fake).

### Kitchen

1. Log in as `kitchen@goldendragon.demo`, open `/dashboard/kitchen`.
2. Your new order appears as **CONFIRMED** → click **Start preparing** →
   **Mark ready** → **Complete** (pickup orders complete right from the
   kitchen queue — no driver involved).

### Kitchen → Driver → Delivery

A real **DELIVERY** order (**#41**) is pre-placed and waiting at
**CONFIRMED** for this leg, because of a discovered gap — see §5.

1. Still logged in as `kitchen@goldendragon.demo`: advance #41 with
   **Start preparing** → **Mark ready**. Delivery orders stop at READY —
   the driver takes it from there.
2. **Assign the driver** (no dashboard button exists for this yet — §5):
   ```sh
   cd apps/api
   BASE_URL=http://localhost:4000 pnpm exec tsx scripts/demo-assign-driver.ts <order-41-id>
   ```
3. Log in as `driver@goldendragon.demo`, open `/dashboard/driver`. The
   offer appears — click **Accept**, then **Mark picked up**, then
   **Mark delivered**.
4. Log in as `owner@goldendragon.demo`, open the order's detail page
   (`/dashboard/orders/<order-41-id>`) and click **Complete** — the
   driver's "delivered" status and the Order's own COMPLETED status are
   two separate fields by design (`Fulfillment.status` vs `Order.status`),
   so this last step is the owner's/staff's own explicit confirmation.

### Owner Dashboard

`owner@goldendragon.demo` → `/dashboard/orders` shows the full order
list (70 seeded historical orders plus whatever you just placed) —
filterable by status, with a detail page per order showing cash
mark-paid and refund actions. `/dashboard/payments`, `/dashboard/coupons`,
`/dashboard/tables`, `/dashboard/kitchen-capacity`, `/dashboard/delivery`,
`/dashboard/menu` are all populated with real seeded data.

### Admin Dashboard

`admin@demo.ordervora.example` → `/dashboard` shows a platform-wide
overview of all 3 restaurants (name, address, published status) — this
view was added this sprint (see §5) since none existed, reusing the
already-implemented `GET /api/admin/restaurants` endpoint.

## 4. QR ordering (bonus)

`owner@goldendragon.demo` → `/dashboard/tables` lists 6 QR tables with
their scan links (`/order/qr/<token>`) — open one in an incognito window
to see the dine-in ordering flow bind a cart to that table.

## 5. What this sprint found and fixed (bugs, not features)

Building this demo meant actually driving the real product end to end
for the first time, which surfaced two genuine, pre-existing defects —
both fixed, since without them core parts of the required workflow were
literally impossible, not just rough:

1. **The customer menu page crashed on load.** `getOrCreateActiveCart()`
   (`cart.service.ts`) returned a bare `Cart` row with no `items` field,
   but the frontend's `Cart` type declares `items` as required and reads
   `cart.items.length` immediately — every visit crashed with `Cannot
   read properties of undefined`. Fixed by including `items` in both the
   found-existing and newly-created cart queries.
2. **The kitchen queue could never advance an order past READY.** Its
   `NEXT_ACTION` map offered "Mark out for delivery" from READY, but the
   order state machine only allows `READY -> COMPLETED` (delivery orders
   branch off *from PREPARING*, not READY) — so every order, pickup or
   delivery, hit a permanent dead end at READY. Fixed by mirroring the
   already-correct action map from `dashboard/orders/[id]/page.tsx`.

Both are covered by the existing/updated test suites (`cart.service.test.ts`
gained a regression test; `orders/[id]/page.tsx`'s pattern was reused
verbatim for `kitchen/page.tsx`, so they can't drift apart silently
again... except by hand — there's no shared constant between the two
files, a deliberate minimal-footprint choice for this sprint).

**Known limitations, deliberately left as findings, not fixed** (fixing
them would mean adding UI surface beyond this sprint's "no new features"
scope):

- **No delivery-address picker on the cart page.** `cart/page.tsx` only
  ever calls `setCartFulfillment({ fulfillmentType })`, never
  `deliveryAddressId` — the backend has always supported it
  (`cart.validation.ts`), there's just no UI control to attach one. A
  DELIVERY order can only be placed by a logged-in customer with a saved
  address (guest checkout has none at all), and only via a direct API
  call today. `scripts/demo-place-delivery-order.ts` is how the one
  pre-placed delivery order in this demo was created.
- **No "assign driver" button anywhere in the dashboard.** The backend
  endpoint (`POST /me/fulfillment/:id/assign-driver`) is fully
  implemented and tested; nothing in `apps/web` calls it.
  `scripts/demo-assign-driver.ts` is the documented workaround (§3 step
  2 above).
- **A cash-paid order can't be refunded via the existing refund
  endpoint.** `refundOrder()` requires an `order.payment` row, which only
  the card-payment path ever creates — `CASH_ON_DELIVERY`/`CASH_AT_PICKUP`
  orders (`markPaidCash`) never get one. Discovered while seeding
  historical order variety; the seed script's order mix was adjusted to
  not attempt cash refunds rather than paper over it.

All three are real product gaps worth their own future-sprint remediation
plan (same discipline this codebase has followed since Sprint 07.6/07.7 —
findings get logged, not silently patched mid-unrelated-sprint), except
the two that were outright blocking this sprint's own stated goal, which
were fixed.

## 6. Resetting the demo data

```sh
psql "$DATABASE_URL" -c 'TRUNCATE TABLE "User", "Restaurant", "Customer", "GuestCustomer" CASCADE;'
cd apps/api
pnpm run seed:beta
# Temporarily raise checkout/staff-action rate limits for the seeding pass only
# (RATE_LIMIT_CHECKOUT_PER_MINUTE / RATE_LIMIT_PUBLIC_COMMERCE_PER_MINUTE /
# RATE_LIMIT_STAFF_ACTION_PER_MINUTE / RATE_LIMIT_AUTH_PER_MINUTE), restart
# the server with those set, then:
BASE_URL=http://localhost:4000 pnpm run seed:beta:orders
BASE_URL=http://localhost:4000 pnpm run seed:beta:delivery-order
# Restart the server again at normal (unset/default) rate limits before demoing.
```
