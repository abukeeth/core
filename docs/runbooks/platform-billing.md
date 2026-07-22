# Platform Billing (SaaS subscriptions) — setup & operations

OrderVora charging business owners. Entirely separate from BYOP payment
providers (owners' own Stripe accounts charging their diners).

## One-time Stripe setup (platform account)

1. In the platform Stripe account (live mode): **Products → Add product** —
   e.g. "OrderVora Starter", recurring monthly price. Copy the price id
   (`price_…`).
2. **Developers → Webhooks → Add endpoint**:
   - URL: `https://<api-host>/api/webhooks/billing`
   - Events: `checkout.session.completed`, `customer.subscription.created`,
     `customer.subscription.updated`, `customer.subscription.deleted`,
     `invoice.payment_failed`
   - Copy the signing secret (`whsec_…`).
3. **Settings → Billing → Customer portal**: enable the portal (allow
   cancel + payment-method update).

## Environment variables (API service)

| Variable | Value |
| --- | --- |
| `PLATFORM_STRIPE_SECRET_KEY` | `sk_live_…` (platform account) |
| `PLATFORM_STRIPE_WEBHOOK_SECRET` | `whsec_…` from step 2 |
| `PLATFORM_STRIPE_PRICE_ID` | `price_…` from step 1 |
| `BILLING_TRIAL_DAYS` | optional, default `14` |
| `BILLING_ENFORCEMENT_ENABLED` | **`false` at first** — see below |

All optional at boot: unset keys leave billing endpoints inert ("billing
not configured") and enforcement off — the deploy is safe with none set.

## Rollout order

1. Deploy with the three Stripe vars set, `BILLING_ENFORCEMENT_ENABLED`
   unset/false. The migration backfills a fresh 14-day trial for every
   existing business.
2. Verify: `/dashboard/billing` shows the trial; **Subscribe now** →
   Stripe Checkout (test with a real card, then refund/cancel in Stripe);
   webhook deliveries show 200 in the Stripe dashboard; the admin panel's
   Businesses tab shows the plan state flip to `ACTIVE`.
3. Only then set `BILLING_ENFORCEMENT_ENABLED=true`. From that moment an
   expired trial/canceled subscription blocks **site publishing** and
   **new order placement** (storefront shows "temporarily unavailable" at
   checkout, never billing language); the dashboard stays open so the
   owner can subscribe.

## How state maps

Stripe → `PlatformSubscription.status`: `active`/`trialing` → `ACTIVE`;
`past_due`/`unpaid` → `PAST_DUE` (still entitled — Stripe dunning grace);
everything else → `CANCELED`. `TRIAL_EXPIRED` is derived (TRIALING +
`trialEndsAt` past), never stored.
