# Sprint 07.6 — Critical Remediation Final Report

**Scope:** Fix all 15 Critical findings from `SPRINT_07_6_REMEDIATION_PLAN.md`. No new features. No UI changes beyond what a fix required. No High/Medium/Low findings touched. Sprint 07.7 not started.

**Branch:** `claude/sprint-07-commerce-engine`

---

## 1. Findings Fixed (15 / 15 Critical)

| ID | Finding | Fix summary |
|----|---------|-------------|
| **C-1** | No payment tokenization UI; card/wallet payments couldn't succeed | Added `PaymentProvider.publicKey`, a public `GET /api/public/restaurants/:id/payment-config` endpoint, and a real Stripe Elements integration (`CardPaymentForm`) on the checkout page. `handlePlaceOrder` now tokenizes client-side before ever calling `placeOrder`. Apple Pay/Google Pay ride the same `PaymentElement` (no separate `PaymentRequestButton` integration needed). |
| **C-2** | Idempotency-key "FAILED → retryable" semantics enabled a double-charge after a partial post-payment failure | Restructured `placeOrder`'s card path so everything after a successful `captureOrderPayment` (status update, event write, `confirmOrder`, sub-ledger, notifications) runs through a `bestEffort()` catch-and-log wrapper and can never throw. `placeOrder` now only throws before payment succeeds. |
| **C-3** | Authorized payment was never voided when the subsequent capture failed | `captureOrderPayment` now calls `adapter.void()` on capture failure; `Payment.status` becomes `VOIDED` on a clean void or `FAILED` + a new typed `PaymentVoidFailedError` when the void itself also fails. |
| **C-4** | Orphaned provider authorization if the `PaymentAttempt` DB write failed | `authorizeOrderPayment` now reserves a `PENDING` `PaymentAttempt` row **before** calling the provider, updating it afterward — a DB failure post-provider-call still leaves an anchoring record. |
| **C-5** | No protection against a concurrent/duplicate `placeOrder` call re-authorizing the same cart | Added a `cart.status !== "ACTIVE"` guard plus a P2002-on-`Order.cartId` catch (`isCartConflict`), both mapping to `CheckoutIneligibleError`. |
| **C-6** | 3DS/SCA challenges were treated as outright declines | `AuthorizeResult`/`AuthorizeOrderPaymentResult` gained a `requiresAction` branch; `stripe.provider.ts` recognizes `requires_action`; the orchestrator never fails over to another provider for it; `placeOrder` returns `202` + `clientSecret` and leaves the order `REQUIRES_ACTION`; a new `POST /checkout/:cartId/confirm-payment` endpoint (backed by `confirmCardPayment`, sharing `completeCardPayment` with `placeOrder`) resumes from the capture step once the customer completes the challenge client-side. |
| **C-7** | Refund failures were reported to customers/staff as successes | `refundOrderPayment` now throws `RefundFailedError` (after still writing the `FAILED` `Refund` row for auditability); `orders.controller.ts` maps it to `502`. |
| **C-8** | Coupon redemption limits enforced via a check-then-act race with no atomicity | The redemption count (global + per-customer) is re-verified inside `placeOrder`'s transaction, immediately before insert, under `Prisma.TransactionIsolationLevel.Serializable`. A resulting `P2034` serialization failure maps to a clear `CheckoutIneligibleError`. |
| **C-9** | No busy-driver check before assignment; a driver could be double-booked | `assignDriver` now calls `countActiveAssignmentsForDriver` (excluding the fulfillment's own existing row) and throws a new `DriverAlreadyBusyError` (409) if the driver already has an active assignment elsewhere. |
| **C-10** | No notification mechanism existed for a new driver offer | Added `User.phone`, `sendDriverAssignmentOfferNotification` (SMS), and wired it into `assignDriver` as a best-effort (never blocks assignment) call. |
| **C-11** | No timeout/automatic reassignment for an unanswered driver offer | Added `DriverAssignment.offerExpiresAt` and a new `EXPIRED` status; `expireStaleOffers()` sweeps stale `OFFERED` rows and raises a `DRIVER_OFFER_EXPIRED` `OrderEvent`; wired to a process-local interval (`stale-offer-scheduler.ts`) started from `index.ts` only (never from `app.ts`, so tests never spin up a background timer). |
| **C-12** | Delivery zone geometry (polygon/radius) was dead code in the routing decision | `RoutingInput`/`resolveRuleChain` now accept `deliveryLat`/`deliveryLng`; a zone-scoped `DeliveryRule` requires `isPointInZone` to pass, and fails closed (skips, doesn't throw) when no point is available. `quote.service.ts` threads the delivery address's own coordinates through. |
| **C-13** | QR table binding could be forged directly, bypassing the token entirely | Removed `tableId` from `createCartSchema`/`setFulfillmentSchema` entirely. Added a dedicated `POST /cart/:cartId/bind-table` endpoint that resolves the table **only** via `resolveTableByToken`, rejecting a cross-restaurant table with `CartRestaurantMismatchError`. |
| **C-14** | No ownership check on cart/order endpoints (IDOR) | Added shared `cart-identity.ts` (`resolveCartIdentity`/`assertCartOwnership`); every cart handler and `checkout.controller.ts`'s `getQuoteHandler`/`placeOrderHandler` now assert ownership before any read/mutation, returning 404 (not 403) on mismatch, per the codebase's existing tenant-isolation convention. |
| **C-15** | A notification failure after payment capture surfaced as a 500 to an already-charged customer | Closed by the same restructuring as C-2 — this was C-2's concrete trigger case; covered by the same `bestEffort()` fix and its dedicated test (`sendOrderConfirmation` throwing after successful capture no longer causes `placeOrder` to throw). |

---

## 2. Files Changed

### Backend (`apps/api`)

**Schema:** `prisma/schema.prisma` — `PaymentProvider.publicKey`, `OrderPaymentStatus.REQUIRES_ACTION`, `PaymentAttemptStatus.REQUIRES_ACTION`, `PaymentStatus.REQUIRES_ACTION`, `DriverAssignmentStatus.EXPIRED`, `DriverAssignment.offerExpiresAt`, `User.phone`, `NotificationType.DRIVER_ASSIGNMENT_OFFER`, `OrderEventType.DRIVER_OFFER_EXPIRED`.

**New files:**
- `modules/commerce/cart/cart-identity.ts`
- `modules/commerce/fulfillment/stale-offer-scheduler.ts`
- `modules/commerce/payments/public-payment-config.service.ts` (+ test)
- `modules/commerce/payments/public-payment-config.controller.ts` (+ test)

**Modified (non-test):**
- `app.ts`, `index.ts`
- `modules/commerce/cart/{cart.controller,cart.routes,cart.service,cart.validation}.ts`
- `modules/commerce/checkout/{checkout.controller,checkout.routes,checkout.service,quote.service}.ts`
- `modules/commerce/delivery-rules/smart-routing.ts`
- `modules/commerce/fulfillment/{fulfillment.controller,fulfillment.errors,fulfillment.service}.ts`
- `modules/commerce/notifications/notifications.service.ts`
- `modules/commerce/orders/orders.controller.ts`
- `modules/commerce/payments/{orchestrator,payments.errors,payments.routes,payments.validation,provider.service,types}.ts`
- `modules/commerce/payments/providers/stripe.provider.ts`

**Modified/added tests:** every file above that has a `.test.ts` counterpart, plus the two new `public-payment-config.*.test.ts` files.

### Frontend (`apps/web`)

**New:**
- `vitest.config.ts`, `vitest.setup.ts` (test runner added — was previously absent, a prerequisite for C-1)
- `app/order/[restaurantId]/checkout/card-payment-form.tsx` (+ test)
- `app/order/[restaurantId]/checkout/page.test.tsx`

**Modified:**
- `package.json` (`@stripe/stripe-js`, `@stripe/react-stripe-js`, `vitest`, `@testing-library/*`, `@vitejs/plugin-react`, `jsdom`)
- `app/order/[restaurantId]/checkout/page.tsx` (Elements wiring, tokenization gating, 3DS resume flow)
- `app/order/qr/[qrToken]/page.tsx` (updated for C-13's new bind-table flow)
- `app/dashboard/payments/page.tsx` (publishable-key input alongside the secret key)
- `lib/commerce-api.ts`, `lib/owner-commerce-api.ts`

---

## 3. Tests Added

- **Backend:** every modified module's existing `.test.ts` file was extended in place; two brand-new test files (`public-payment-config.service.test.ts`, `public-payment-config.controller.test.ts`). Net result: **734 passing tests** across 110 test files in `apps/api` (up from the pre-Sprint-07.6 baseline).
- **Frontend:** a test runner (vitest + Testing Library) was added from scratch — previously `apps/web` had none. **9 passing tests** across 2 new test files: `card-payment-form.test.tsx` (tokenization success/failure, incomplete-card handling, Element rendering) and `page.test.tsx` (tokenization blocks `placeOrder`, cash bypasses tokenization entirely, card option disabled with no payment config, 3DS `requiresAction` → `confirmChallenge` → `confirmCardPayment` flow).
- Every fix's specific regression case called out in the remediation plan has a corresponding test (e.g., C-4's "PENDING row survives a post-provider DB failure" via `invocationCallOrder`; C-8's simulated `P2034` serialization failure; C-9's "reassigning to the same driver is a no-op"; C-12's "zone geometry actually gates the routing decision, not just an empty-array pass-through").

---

## 4. Verification Results

Run from the repo root unless noted:

| Step | Result |
|------|--------|
| `prisma validate` | ✅ Pass |
| `prisma generate` | ✅ Pass |
| `pnpm -r lint` (api + web) | ✅ Pass, no warnings |
| `pnpm -r typecheck` (api + web) | ✅ Pass |
| `pnpm -r test` | ✅ **743 / 743 passing** (734 `apps/api` + 9 `apps/web`) |
| `pnpm -r build` (api `tsc`, web `next build`) | ✅ Pass, all 28 web routes compiled |

No test was skipped, weakened, or deleted to make the suite pass.

---

## 5. Remaining High Findings (Sprint 07.7 — not started, per instruction)

All 13 High-priority findings from the remediation plan remain open, unchanged by this sprint:

- **H-2** — `markPaidCash` can double-book cash revenue (no idempotency guard)
- **H-3** — Raw provider error messages leak to the public checkout endpoint (card-testing oracle)
- **H-4** — Refund can exceed the remaining captured balance (`RefundExceedsRemainingBalanceError` already scaffolded, unused)
- **H-5–H-14** — remaining High findings per `SPRINT_07_6_REMEDIATION_PLAN.md`'s "Sprint 07.7 — High Priority Fixes" section (webhook/reconciliation gaps, event-bus single-instance limitations, order-number race, public order-tracking model, POS sync, etc.)

None of these were touched, per the explicit instruction to fix only the 15 Critical findings this sprint.

---

## 6. Notes / Residual Risk Carried Forward

- **C-1/C-6:** wallet payments (Apple Pay/Google Pay) ride Stripe's `PaymentElement` rather than a separate `PaymentRequestButtonElement` integration — functionally equivalent (same `pm_xxx` tokenization contract) and lower-maintenance, called out as a deliberate scope simplification.
- **C-8:** serializable-isolation behavior under genuine concurrency cannot be proven by a mocked unit test; recommend a narrow integration-test lane against a real Postgres instance if/when this codebase adds one.
- **C-10:** the SMS provider adapter is still a stub (`implemented: false`) — the notification *code path* is now correct and wired, but no real SMS delivery happens until a real adapter is connected (tracked, not blocking).
- **C-11:** the interval-based stale-offer sweep is process-local and will miss expirations across a deploy/restart window — acceptable for the current single-instance deployment, flagged for revisit alongside the event bus's own single-instance limitation (H-11) if horizontal scaling is introduced.

---

*Do not start Sprint 07.7 without explicit instruction.*
