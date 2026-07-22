# First live customer payment — production verification runbook

Goal: prove the BYOP (bring-your-own-provider) Stripe path end to end in
production — connect, authorize+capture, refund, webhook — on a real
restaurant. As of the launch-critical sprint audit, **zero payments have
ever been processed in production**; this runbook closes that gap.

## Prerequisites

- A restaurant with a published storefront and at least one menu item.
- The owner's own Stripe account (live mode) — secret key `sk_live_…` and
  publishable key `pk_live_…`.

## Step 1 — Connect Stripe (owner dashboard)

1. Dashboard → **Payments** → provider `STRIPE`.
2. Credentials: paste the **secret key**; public key field: the
   **publishable key**. Connect.
3. Expect status `CONNECTED`. (Row is per-restaurant: BYOP.)

## Step 2 — Register the payment webhook (owner's Stripe account)

1. Copy the provider row's id (admin → Businesses, or the Payments page).
2. Stripe → Developers → Webhooks → Add endpoint:
   `https://<api-host>/api/webhooks/payments/stripe?providerId=<PaymentProvider id>`
   Events: `payment_intent.succeeded`, `payment_intent.payment_failed`,
   `charge.refunded`.
3. Save the signing secret into the provider's webhook secret field
   (reconnect with webhook secret if the form has the field).

## Step 3 — Place a real card order

1. Open the public storefront on a phone → add an item → checkout.
2. Pay with a REAL card (small amount — you will refund it).
3. Expect: order confirmation page; order appears in Dashboard → Orders
   with payment status `PAID`; Stripe dashboard shows the charge.

## Step 4 — Verify capture & webhook

- Admin panel → **Payments** tab: the payment row shows captured amount
  and status.
- Stripe → Webhooks: the delivery attempts list shows 200 responses.

## Step 5 — Refund

1. Stripe dashboard → the charge → Refund (full).
2. Expect: `charge.refunded` webhook delivered (200); admin Payments tab
   shows the refunded amount on the row.

## Sign-off checklist

- [ ] Provider CONNECTED
- [ ] Live charge succeeded and order marked PAID
- [ ] Webhook deliveries all 200
- [ ] Refund reflected in admin Payments
- [ ] No Sentry/API errors during the run

Record date, order id, and payment id here when done.
