# Sprint 07.6 / 07.7 Commerce Remediation Plan

**Type:** Implementation specification only. No code has been written or modified in the course of producing this document.
**Source:** Every finding below is carried over by ID from `docs/reports/Sprint07/SPRINT_07_5_COMMERCE_STABILIZATION_AUDIT.md`.
**Grouping:**
- **Sprint 07.6 — Critical Fixes**: all 15 Critical findings (C-1 through C-15). Nothing here is optional — these are the findings that block real paid orders or break a stated security boundary.
- **Sprint 07.7 — High Priority Fixes**: all 13 High findings (H-2 through H-14; H-1 does not exist as a separate ID — it was folded into C-1 in the audit).
- **Future Improvements**: all 19 Medium (M-1–M-19) and 10 Low (L-2–L-11; L-1 does not exist as a separate ID) findings, sequenced by recommended order rather than strict severity, since several are cheap wins worth doing early.

**Total findings covered: 57** (15 Critical + 13 High + 19 Medium + 10 Low).

Every finding entry below follows the same fixed structure: **ID / Root Cause / Files to Modify / Exact Implementation Plan / Tests to Add / Risk After Fix**. "Risk after fix" states what residual risk remains even once the fix lands — nothing in this plan claims to reduce any risk to zero.

---

## Sequencing Note

Several Critical fixes share infrastructure and should land in a specific order within Sprint 07.6, not findings-list order:

1. **C-14** (cart/order identity ownership) first — it's the smallest, most self-contained change and several other fixes (C-5, C-2) touch the same `checkout.service.ts`/`cart.service.ts` call sites, so landing the ownership check first avoids merge conflicts with the money-flow fixes.
2. **C-4 → C-3 → C-7** (orchestrator hardening: orphaned-authorization prevention, void-on-capture-failure, refund-status verification) next, as one cohesive orchestrator change, since they touch the same three functions in `orchestrator.ts`.
3. **C-5 → C-2 → C-15** (checkout idempotency/retry redesign) next, as one cohesive `checkout.service.ts` change, since C-2's fix reshapes the exact code region C-5 and C-15 also touch.
4. **C-1 → C-6** (payment tokenization UI, then 3DS completion flow) — C-6 is not implementable until C-1's Elements integration exists, since 3DS requires the client-side `client_secret` confirmation step Elements provides.
5. **C-8** (coupon race) and **C-13** (QR bypass) and **C-9/C-10/C-11** (driver dispatch) are independent of the above and of each other — safe to parallelize across engineers.
6. **C-12** (delivery zone geometry) is fully independent and safe to do any time.

---

# Sprint 07.6 — Critical Fixes

## C-1 — No payment tokenization UI; card and wallet payments cannot succeed

**Root Cause:** The checkout page (`apps/web/src/app/order/[restaurantId]/checkout/page.tsx`) was built with a payment-method *selector* but the actual client-side tokenization integration (Stripe.js / Elements / Payment Request API) was never implemented. `handlePlaceOrder` constructs its `PlaceOrderInput` with `methodType` only; `methodToken` is never populated. On the backend, `checkout.service.ts:191-194` (see `placeOrder`, the `if (!input.methodToken)` branch) correctly requires a token for every non-cash method and fails fast — the backend is not the problem; the frontend never collects one.

**Files to Modify:**
- `apps/api/prisma/schema.prisma` — add `PaymentProvider.publicKey String?` (nullable, plaintext; a Stripe publishable key is safe to expose client-side by design, unlike the secret key).
- `apps/api/src/modules/commerce/payments/payments.validation.ts` — extend `connectProviderSchema` with an optional `publicKey: z.string().min(1).optional()`.
- `apps/api/src/modules/commerce/payments/provider.service.ts` — persist `publicKey` in `connectProvider`'s `create`/`update` data.
- `apps/api/src/modules/commerce/payments/public-payment-config.service.ts` (**new**) — `getPublicPaymentConfig(restaurantId)`, returns the restaurant's default/priority-1 `CONNECTED` Stripe provider's `providerType` and `publicKey`, or `null` if none.
- `apps/api/src/modules/commerce/payments/public-payment-config.controller.ts` (**new**) — thin handler wrapping the above.
- `apps/api/src/modules/commerce/payments/payments.routes.ts` — add `publicPaymentConfigRouter` exporting `GET /restaurants/:restaurantId/payment-config`, mounted at `/api/public` in `app.ts` alongside the other public commerce routers.
- `apps/web/package.json` — add `@stripe/stripe-js` and `@stripe/react-stripe-js`.
- `apps/web/src/lib/commerce-api.ts` — add `getPublicPaymentConfig(restaurantId)` fetch wrapper.
- `apps/web/src/app/order/[restaurantId]/checkout/card-payment-form.tsx` (**new**) — wraps Stripe's `<Elements>` provider (initialized with the fetched publishable key) around a `<PaymentElement>`; exposes an imperative `confirmAndTokenize()` that calls `stripe.createPaymentMethod({ elements })` and returns the resulting `pm_xxx` id.
- `apps/web/src/app/order/[restaurantId]/checkout/page.tsx` — replace the current plain radio-button payment section: render `<CardPaymentForm>` when a card brand is selected, render Stripe's `PaymentRequestButtonElement` (gated on `paymentRequest.canMakePayment()` resolving truthy) when Apple Pay/Google Pay is selected, and populate `methodToken` from whichever path succeeds before calling `placeOrder`.

**Exact Implementation Plan:**
1. Migration: add the nullable `publicKey` column to `PaymentProvider`; no backfill needed (existing rows get `null`, meaning card checkout stays disabled for restaurants that reconnect without supplying it — call this out to already-onboarded restaurants).
2. Extend the owner-facing "connect Stripe" form/flow (`apps/web/src/app/dashboard/payments/page.tsx`) to also collect the publishable key alongside the secret key, and send it through to `connectProvider`.
3. Build the new public `GET /api/public/restaurants/:id/payment-config` endpoint — no auth (must be callable from an anonymous checkout), rate-limited with `publicCommerceRateLimiter` (already used elsewhere for public reads).
4. On the checkout page, fetch payment config once on mount (alongside the existing cart/quote fetch), initialize `loadStripe(publicKey)` lazily, and render `<Elements stripe={stripePromise}>` around the payment section only once the key is available.
5. Implement `CardPaymentForm` using Stripe's `PaymentElement` (preferred over the older `CardElement` since it auto-adapts to available payment methods, including wallets, without a second integration).
6. Implement the Apple Pay/Google Pay path via Stripe's `paymentRequest` object + `PaymentRequestButtonElement`, which internally uses the same `createPaymentMethod` flow and therefore produces the same `pm_xxx` shape the backend already expects as `methodToken` — no backend branching needed by wallet type.
7. On `handlePlaceOrder`, call the appropriate tokenization path first, populate `methodToken` from its result, and only then call `placeOrder`; surface Stripe's own client-side validation errors (e.g., incomplete card) before ever hitting the network.
8. Do not implement 3DS completion in this fix — that's C-6, sequenced immediately after this one since it depends on the Elements integration existing.

**Tests to Add:**
- Backend: `public-payment-config.service.test.ts` — returns `null` when no `CONNECTED` provider exists; returns the correct provider's `publicKey` when one does; never returns `credentialsEncrypted`/`webhookSecretEncrypted` (explicit assertion that the response shape excludes them).
- Backend: `public-payment-config.controller.test.ts` — 200 with the public shape; rate-limiter applied (integration-style check that the route is registered with the limiter middleware).
- Backend: `provider.service.test.ts` — `connectProvider` persists `publicKey` when supplied, leaves it `null` when omitted.
- Frontend: since `apps/web` currently has no test runner configured, add one as part of this fix (`vitest` + `@testing-library/react` is the natural choice given `apps/api` already uses vitest) — this is a prerequisite, not optional, given C-1 is the highest-risk frontend change in the plan. Component tests: `CardPaymentForm` renders `PaymentElement` once Stripe is loaded; `handlePlaceOrder` is blocked (no `placeOrder` call) until tokenization resolves; a tokenization failure surfaces an inline error and does not call `placeOrder`.
- Manual/E2E (documented, not automated in this pass — Playwright is not yet set up for this repo): full checkout using Stripe's documented test card numbers in test mode, covering a successful card payment, a declined card, and a wallet payment via a Chrome/Safari test environment that supports the Payment Request API.

**Risk After Fix:** Card/wallet checkout becomes functionally possible, but the fix is incomplete without C-6 (3DS) — a real card requiring a 3DS challenge will still fail until that lands. The new public payment-config endpoint is a small new unauthenticated surface; it must return only `providerType`/`publicKey`, never anything else, or it reopens a version of M-2.

---

## C-2 — Idempotency-key "FAILED → retryable" semantics enable double-charge after a partial post-payment failure

**Root Cause:** `checkout.service.ts`'s `placeOrder` wraps the payment authorize/capture block (lines ~195–220) in try/catch, but the steps that run immediately after successful capture — `sendOrderConfirmation`, `sendNewOrderStaffAlert`, the final `prisma.order.findUniqueOrThrow` — run outside that guard (lines ~223–231), even though money has already moved. `checkout.controller.ts`'s `placeOrderHandler` calls `failIdempotencyKey` on *any* thrown error from `placeOrder`, and `lib/idempotency.ts`'s `reserveIdempotencyKey` explicitly treats a `FAILED`-status key as retryable (`status: "fresh"` is returned again). The frontend (`apps/web/src/lib/cart-storage.ts`) deliberately preserves the same idempotency key across retries, clearing it only on success — so a well-behaved client retry after this failure mode replays the entire `placeOrder` call, including a second real authorize+capture.

**Files to Modify:**
- `apps/api/src/modules/commerce/checkout/checkout.service.ts` — restructure `placeOrder`'s tail so that idempotency completion is recorded immediately after successful capture, before any subsequent side effect can throw.
- `apps/api/src/modules/commerce/checkout/checkout.controller.ts` — `placeOrderHandler` needs to distinguish "payment succeeded, a downstream side effect failed" from "the order genuinely failed," so it doesn't call `failIdempotencyKey` in the former case.
- `apps/api/src/lib/idempotency.ts` — no change to the core mechanism; the fix is entirely about *when* `completeIdempotencyKey`/`failIdempotencyKey` are invoked relative to payment success, not the library's retry semantics themselves (those are correct in isolation).

**Exact Implementation Plan:**
1. In `placeOrder`, immediately after the line that sets `paymentStatus: "PAID"` (right after `captureOrderPayment` succeeds) and before `confirmOrder`/`createSubLedgerTransactions` are called, treat the order as **payment-complete** for idempotency purposes.
2. Move the responsibility for calling `completeIdempotencyKey` out of the controller's single end-of-function call and into a shape where `placeOrder` itself signals "payment succeeded" independently of whether later steps throw. Concretely: have `placeOrder` catch its own post-payment side-effect errors (notification sends, the final re-fetch) internally, log them, and *not* rethrow — the function should only throw before payment succeeds, never after. This makes the controller's existing single try/catch correct again without needing to inspect error types.
3. Apply the identical treatment to the cash-payment branch (`confirmOrder` call) — once `confirmOrder` succeeds, subsequent notification failures must not cause `placeOrder` to throw either.
4. As a second, independent layer of protection (defense in depth, not a substitute for step 2–3): change `failIdempotencyKey`'s caller in `checkout.controller.ts` so that a `FAILED` key is only ever produced when `placeOrder` throws *before* an `Order` row exists in a payment-resolved state — i.e., check `order.paymentStatus` is still `UNPAID`/absent before marking the key failed-and-retryable. This guards against any other future code path making the same category of mistake.

**Tests to Add:**
- `checkout.service.test.ts`: a scenario where `authorizeOrderPayment`/`captureOrderPayment` succeed but `sendOrderConfirmation` throws — assert `placeOrder` still resolves successfully (returns the order), does not rethrow, and the order's `paymentStatus` is `PAID`.
- Same scenario for the cash-payment branch (`confirmOrder` succeeds, notification throws) — assert no rethrow.
- `checkout.controller.test.ts`: assert `failIdempotencyKey` is never called when `placeOrder` resolves successfully despite an internally-logged notification failure (this is really an assertion on the service-layer fix, surfaced at the controller level as "the 500 no longer happens").
- New regression test explicitly named for this finding, e.g. `"does not allow a second charge when the same idempotency key is retried after a post-payment notification failure"` — simulate: first call, capture succeeds, notification throws (now swallowed per the fix), key is completed; second call with the same key returns the `"completed"` cached response and `placeOrder`/`authorizeOrderPayment` is never invoked a second time (assert the payment mock's call count is exactly 1).

**Risk After Fix:** The double-charge path via key-retry is closed. A residual, much smaller risk remains: if the process crashes between capture succeeding and `completeIdempotencyKey` being called (a true process-level crash, not an application-level exception), the key could still be left `IN_PROGRESS` indefinitely rather than `FAILED`/`COMPLETED` — this is a separate, lower-probability gap (not enumerated as its own finding in the audit) worth a follow-up TTL/reaper job on `IdempotencyKey` rows stuck `IN_PROGRESS` past a generous timeout.

---

## C-3 — Authorized payment is never voided when the subsequent capture fails

**Root Cause:** `orchestrator.ts`'s `captureOrderPayment` throws a plain `Error` on capture failure (`if (!result.success) throw new Error(...)`); the caller in `checkout.service.ts` (the `catch` block around the authorize/capture pair) only calls `failOrder()`, which updates `Order.status`/`paymentStatus` to `FAILED` and does nothing else. `adapter.void()` is fully implemented on `stripe.provider.ts` and is never referenced by `orchestrator.ts`.

**Files to Modify:**
- `apps/api/src/modules/commerce/payments/orchestrator.ts` — `captureOrderPayment`'s failure path.
- `apps/api/src/modules/commerce/payments/orchestrator.test.ts` — new coverage.
- `apps/api/src/modules/commerce/payments/payments.errors.ts` — add a typed `PaymentVoidFailedError` (distinct from a generic capture failure) so a void-also-failed case is distinguishable from a clean void.

**Exact Implementation Plan:**
1. In `captureOrderPayment`, when `adapter.capture(...)` returns `{ success: false }`, call `adapter.void(attempt.providerPaymentIntentId, credentials)` before throwing, using the same `credentials`/`adapter` already resolved earlier in the function.
2. On successful void: update `Payment.status` to a new terminal state reflecting "authorized then voided" — reuse the existing `Payment` status enum's `FAILED` value if it already covers this semantically (verify against `schema.prisma`'s `PaymentStatus` enum; if it doesn't have a distinct voided state, this is the moment to add one, e.g. `VOIDED`, via a small migration) rather than leaving it silently stuck at `AUTHORIZED`.
3. On a *failed* void (the provider rejects the void call too — e.g., the authorization already expired or was already captured out-of-band): still throw from `captureOrderPayment`, but throw the new `PaymentVoidFailedError` with enough detail (payment id, provider intent id) for it to be logged loudly (this is the one true "needs a human" case — everything else in this fix is fully automatic) and, ideally, surfaced as a dashboard alert in a later sprint (out of scope for this fix; note as a follow-up).
4. Ensure `checkout.service.ts`'s catch block around the authorize/capture pair still correctly calls `failOrder()` regardless of which of the above three outcomes occurred — the order-level state machine doesn't need to distinguish "voided cleanly" from "void also failed," only the `Payment`/alerting layer does.

**Tests to Add:**
- `orchestrator.test.ts`: capture fails → `adapter.void()` is called with the correct `providerPaymentIntentId` and credentials; `Payment.status` updates to the new voided state; the function still throws (so the caller's existing `failOrder()` path is unaffected).
- `orchestrator.test.ts`: capture fails AND void fails → `PaymentVoidFailedError` is thrown (not a generic `Error`), and the payment/attempt state reflects the unresolved condition distinctly from the clean-void case (so a future reconciliation job can query for exactly this state).
- `checkout.service.test.ts`: existing capture-failure test still passes with `adapter.void` mocked and asserted as called.

**Risk After Fix:** The common case (transient capture failure) now correctly releases the customer's hold automatically. The residual risk is the void-also-fails case, which is rare (both the capture and the void calls failing against the same provider in the same request) but not eliminated — it becomes a loud, typed, queryable failure state instead of a silent one, which is the appropriate scope for this fix; building the "needs a human" alerting/dashboard surface for it is explicitly deferred to a follow-up.

---

## C-4 — Orphaned provider authorization if the `PaymentAttempt` database write fails

**Root Cause:** `orchestrator.ts`'s `authorizeOrderPayment` calls `adapter.authorize(...)` (a real, possibly-successful provider-side call) and only afterward calls `prisma.paymentAttempt.create(...)`. If that `create()` throws (transient DB error, connection pool exhaustion), the function's exception propagates with zero record of the provider's `providerPaymentIntentId` anywhere in the database — the webhook reconciliation path in `webhook.service.ts` looks up incoming events by exactly that ID and can never match this orphaned authorization.

**Files to Modify:**
- `apps/api/src/modules/commerce/payments/orchestrator.ts` — reorder `authorizeOrderPayment`'s write-then-call sequence.
- `apps/api/prisma/schema.prisma` — `PaymentAttempt.status` already includes a `PENDING` value per the schema's documented enum (verify at migration time; if absent, add it) to represent "reserved before the provider call, not yet resolved."

**Exact Implementation Plan:**
1. Before calling `adapter.authorize(...)`, write a `PaymentAttempt` row with `status: "PENDING"` and no `providerPaymentIntentId` yet, capturing `attemptNumber`, `orderId`, `providerId`, `methodType`, `amountCents` — everything already known at that point.
2. Call `adapter.authorize(...)` as today.
3. Update the same `PaymentAttempt` row (by its now-known id) with the result: `status`, `providerPaymentIntentId`, `failureCode`, `failureMessage`. This changes the operation from "create after the fact" to "create-then-update," so a DB failure on the *second* write (the update) still leaves a `PENDING` row with no intent id — a strictly smaller and more recoverable gap than today's "no row at all," and one a periodic sweep (see step 4) can specifically detect and reconcile via `adapter.getStatus()` against the provider, keyed by order/attempt, without needing the intent id.
4. Add a narrow reconciliation job (can be a manually-triggered admin endpoint in this pass rather than a full scheduler, to keep scope contained — schedule the actual cron wiring as a fast-follow) that finds `PaymentAttempt` rows stuck in `PENDING` past a short threshold (e.g. 2 minutes) and calls `adapter.getStatus()` using the order's known provider to try to recover the real intent id and reconcile status.

**Tests to Add:**
- `orchestrator.test.ts`: the initial `PENDING` row is written before `adapter.authorize` is called (assert call order via mock invocation order, not just final state).
- `orchestrator.test.ts`: if the provider call succeeds but the *update* write throws, the function still throws, but a `PENDING` row with the correct `orderId`/`attemptNumber` remains queryable afterward (assert via the mocked `prisma.paymentAttempt.update` throwing and then directly querying the mock's `create` call args).
- New test for the reconciliation helper (once built): given a `PENDING` attempt older than the threshold, calls `adapter.getStatus()` and updates the row accordingly.

**Risk After Fix:** The zero-record case is eliminated; a small window remains where a row exists but is `PENDING` with no intent id if the *second* write also fails — this is the residual, and it's why the reconciliation sweep in step 4 is part of this fix's scope rather than a "nice to have."

---

## C-5 — Double-order and double-charge via cart re-checkout

**Root Cause:** `placeOrder` sets `cart.status = "CONVERTED"` inside the `$transaction` that creates the order, but nothing at the top of `placeOrder` checks the cart's current `status` before proceeding. A second `place-order` call against the same `cartId` with a different `Idempotency-Key` sails through every existing check (cart exists, has items, price hasn't drifted) and creates a second `Order`.

**Files to Modify:**
- `apps/api/src/modules/commerce/checkout/checkout.service.ts` — add a status guard at the top of `placeOrder`.
- `apps/api/src/modules/commerce/checkout/checkout.errors.ts` — the existing `CheckoutIneligibleError` is reusable here (no new error type needed — this is exactly the kind of case it exists for), or reuse the already-defined-but-dead `CheckoutInProgressError` if the state is specifically `"ACTIVE"` transitioning-to-`"CONVERTED"` mid-flight (see step 3 below) — clarifying which is used avoids adding a third overlapping error type.

**Exact Implementation Plan:**
1. Immediately after `getCartWithItems(cartId)` resolves and the existing `cart.restaurantId !== restaurantId` check, add: `if (cart.status !== "ACTIVE") throw new CheckoutIneligibleError("This cart has already been checked out")`.
2. This alone closes the primary reported scenario (a cart that has already fully converted). It does **not** close a narrower race where two requests both read `status: "ACTIVE"` before either has committed its transaction — that residual race is intentionally addressed by reusing the **existing, already-correct idempotency-key mechanism** for same-key retries, combined with a new safeguard: add a partial unique index on `Order(cartId)` — check whether `Order.cartId` already has a `@unique` constraint in `schema.prisma` (the audit notes it does: "independently blocked by `Order.cartId @unique`"). Confirm this constraint exists and is actually enforced; if so, the true concurrent-race case (two simultaneous requests, both past the status check before either commits) is already caught at the database level and will surface as a `P2002` on `tx.order.create` — which needs the same unhandled-`P2002` treatment described in M-5, so cross-reference that fix.
3. Add explicit handling in `placeOrder`'s transaction for a `P2002` on `Order.cartId` specifically: catch it and rethrow as `CheckoutIneligibleError("This cart has already been checked out")` rather than letting it surface as a raw 500 — this is the concurrent-race closer that complements the status check in step 1.

**Tests to Add:**
- `checkout.service.test.ts`: calling `placeOrder` twice in sequence against the same cart — mock `getCartWithItems` to return `status: "CONVERTED"` on the second call — asserts the second call throws `CheckoutIneligibleError` and never calls `authorizeOrderPayment`.
- `checkout.service.test.ts`: simulate the `Order.cartId` unique-constraint violation (mock `tx.order.create` to reject with a `Prisma.PrismaClientKnownRequestError` code `P2002`) and assert it's caught and rethrown as `CheckoutIneligibleError`, not left to propagate as a raw error.
- `checkout.controller.test.ts`: assert `CheckoutIneligibleError` maps to the existing 422 response, consistent with other ineligibility cases.

**Risk After Fix:** The reported double-order scenario (sequential re-checkout after a prior success) is fully closed by the status check. The true simultaneous-race case is closed at the database constraint level, contingent on confirming `Order.cartId @unique` is genuinely present and enforced (verify during implementation, not just trust the audit's citation) — if it's missing, adding it is part of this fix's scope, not optional.

---

## C-6 — 3D Secure / SCA challenges are treated as outright declines

**Root Cause:** `stripe.provider.ts`'s `authorize()` only treats the Stripe PaymentIntent statuses `requires_capture`/`succeeded` as success; every other status — including `requires_action` (Stripe's status when a 3DS/SCA challenge is needed) — falls into the generic failure branch with a confusing `failureMessage: "Unexpected PaymentIntent status: requires_action"`. There is no `client_secret` returned to the caller and no endpoint to confirm a PaymentIntent after the customer completes a challenge.

**Files to Modify:**
- `apps/api/src/modules/commerce/payments/types.ts` — extend `AuthorizeResult` with an optional `requiresAction?: { clientSecret: string }` branch, distinct from `success`/`failure`.
- `apps/api/src/modules/commerce/payments/providers/stripe.provider.ts` — recognize `requires_action` as a third outcome, not a failure.
- `apps/api/src/modules/commerce/payments/orchestrator.ts` — `authorizeOrderPayment` must propagate a `requiresAction` outcome distinctly from a hard failure (it should **not** try the next provider in the failover list — this is a customer-interaction-required state, not a provider outage).
- `apps/api/src/modules/commerce/checkout/checkout.service.ts` — `placeOrder` must handle a `requiresAction` result from `authorizeOrderPayment` by returning that state to the caller instead of proceeding to `captureOrderPayment` or failing the order.
- `apps/api/src/modules/commerce/checkout/checkout.controller.ts` — `placeOrderHandler` needs a new response shape for this case (e.g., `202` with `{ requiresAction: { clientSecret } }`) instead of the current `201`.
- `apps/api/src/modules/commerce/checkout/checkout.routes.ts` — new endpoint `POST /checkout/:cartId/confirm-payment` (or similar) that the frontend calls after the customer completes the 3DS challenge client-side, which re-checks the PaymentIntent's status with Stripe and, on success, proceeds through the same capture/confirm/notify path `placeOrder` currently runs inline.
- `apps/web/src/app/order/[restaurantId]/checkout/page.tsx` — on receiving a `requiresAction` response, call `stripe.confirmCardPayment(clientSecret)` (part of the C-1 Elements integration) to complete the challenge in the browser, then call the new confirm-payment endpoint.

**Exact Implementation Plan:**
1. This is explicitly sequenced after C-1 (per the Sequencing Note) since it requires the Elements/`clientSecret`-handling groundwork that fix lays down — do not attempt this before C-1 lands.
2. Refactor `placeOrder`'s payment section so that a `requiresAction` outcome from `authorizeOrderPayment` returns early with the order left in `PENDING_PAYMENT`/`AUTHORIZED`-pending-confirmation state (a new intermediate state may be needed on `Order.paymentStatus` — check the existing enum and extend if it doesn't already have something like `REQUIRES_ACTION`).
3. Build the confirm-payment endpoint as effectively "resume `placeOrder` from the capture step" for an order already in this intermediate state — extract the capture/confirm/notify tail of `placeOrder` into a shared internal function both code paths call, rather than duplicating it.
4. On the frontend, this becomes a two-step flow only when `requiresAction` is returned: (a) `placeOrder` call returns `requiresAction`, (b) `stripe.confirmCardPayment` runs client-side, (c) on success, call the new confirm endpoint to finish the order server-side.

**Tests to Add:**
- `stripe.provider.test.ts`: a PaymentIntent with status `requires_action` produces a `requiresAction` result (not `success: false`), including the `client_secret`.
- `orchestrator.test.ts`: `authorizeOrderPayment` propagates `requiresAction` without trying a fallback provider (assert only one provider was attempted).
- `checkout.service.test.ts`: `placeOrder` returns the `requiresAction` shape and leaves the order in the correct intermediate state, without calling `captureOrderPayment`.
- New `checkout.service.test.ts` coverage for the extracted "resume from capture" internal function, exercised both via `placeOrder`'s cash/direct-success path and via the new confirm-payment path, to confirm no duplicated/diverged logic between the two callers.
- `checkout.controller.test.ts`: the new confirm-payment endpoint's success/failure mapping.

**Risk After Fix:** Cards requiring 3DS become payable. Residual risk: this is a materially more complex flow than a single-request checkout, and the "order sits in an intermediate state until the customer completes the challenge" case needs the same abandoned-order handling considered for the existing `PENDING_PAYMENT` gap (L-4) — an order that never gets its challenge completed will need the same kind of timeout/cleanup treatment, which should be scoped together with that fix rather than duplicated.

---

## C-7 — Refund failures are reported to customers and staff as successes

**Root Cause:** `orchestrator.ts`'s `refundOrderPayment` calls `adapter.refund(...)`, writes a `Refund` row with `status: result.success ? "COMPLETED" : "FAILED"`, and **returns that row regardless of `result.success`** — it never throws on provider-side rejection. `orders.service.ts`'s `refundOrder` calls `refundOrderPayment(...)` and never inspects the returned `refund.status` before unconditionally transitioning the order to `REFUNDED`/`PARTIALLY_REFUNDED` and calling `sendRefundIssuedNotification`.

**Files to Modify:**
- `apps/api/src/modules/commerce/payments/orchestrator.ts` — `refundOrderPayment`.
- `apps/api/src/modules/commerce/payments/payments.errors.ts` — activate the existing-but-unused `PaymentNotFoundError`, and add a new `RefundFailedError`.
- `apps/api/src/modules/commerce/orders/orders.service.ts` — `refundOrder`.
- `apps/api/src/modules/commerce/orders/orders.controller.ts` — `refundHandler`'s catch chain.

**Exact Implementation Plan:**
1. In `refundOrderPayment`, after writing the `Refund` row, add: `if (!result.success) throw new RefundFailedError(result.failureMessage)`. The row itself should still be written before throwing (so the `FAILED` refund attempt is auditable), but the function's contract becomes "returns only on confirmed success."
2. In `orders.service.ts`'s `refundOrder`, remove the implicit assumption that `refundOrderPayment` always succeeds when it returns — this is now guaranteed by step 1's throw, so no explicit status check is needed at the call site; the natural exception propagation now correctly prevents the order-status transition and the customer notification from running on a failed refund.
3. In `orders.controller.ts`'s `refundHandler`, add `RefundFailedError` to the typed-error catch chain, mapping it to a `502` (the platform's own request was fine; the upstream provider rejected the operation) with a message safe to show staff (not necessarily the raw provider text — apply the same sanitization principle as H-3's fix).

**Tests to Add:**
- `orchestrator.test.ts`: `adapter.refund` returns `{ success: false, failureMessage }` → `refundOrderPayment` throws `RefundFailedError`, and the `Refund` row was still written with `status: "FAILED"` beforehand (assert via the mocked `prisma.refund.create` call).
- `orders.service.test.ts`: `refundOrderPayment` throwing `RefundFailedError` → `refundOrder` does not transition `Order.status`, does not send the refund-issued notification, and propagates the error to its caller.
- `orders.controller.test.ts`: `RefundFailedError` maps to `502` with a sanitized message.

**Risk After Fix:** A failed refund is now correctly surfaced as an error to staff, who can retry or investigate, rather than a silent false-success. Residual risk: partial provider failures (e.g., the provider accepts the refund but the confirmation webhook never arrives) are a separate reconciliation concern not covered by this fix — the refund's `Refund.status` should already correctly reflect `FAILED` vs `COMPLETED` based on the synchronous API response, which covers the common case; asynchronous refund-status changes are out of scope here.

---

## C-8 — Coupon redemption limits are enforced via a check-then-act race with no atomicity

**Root Cause:** `coupons.service.ts`'s `validateCouponForRedemption` counts existing `CouponRedemption` rows via `prisma.couponRedemption.count(...)` and compares against `maxRedemptions`/`maxRedemptionsPerCustomer`, entirely outside any transaction or row lock. The actual redemption insert happens later, inside `checkout.service.ts`'s `$transaction`, in a separate database round trip. No unique constraint on `CouponRedemption` prevents two concurrent orders from each passing the count check and both inserting.

**Files to Modify:**
- `apps/api/src/modules/commerce/coupons/coupons.service.ts` — `validateCouponForRedemption`.
- `apps/api/src/modules/commerce/checkout/checkout.service.ts` — the coupon-redemption insert inside `placeOrder`'s transaction.

**Exact Implementation Plan:**
1. Move the redemption *count check* into the same transaction as the redemption *insert*, re-verified at the moment of insert — not just validated earlier in the request via the pre-transaction `validateCouponForRedemption` call, which remains useful as an early, non-authoritative UX check but is no longer the sole gate. Restructure `placeOrder`'s existing `$transaction` (where `tx.couponRedemption.create` already runs) to perform `tx.couponRedemption.count(...)` immediately before the insert.
2. Use Postgres's transaction isolation to make this safe under concurrency: run the count-then-insert step with `isolationLevel: Prisma.TransactionIsolationLevel.Serializable` (Prisma supports per-transaction isolation level configuration) — this causes one of two truly concurrent transactions to fail with a serialization error rather than both silently succeeding past the cap, the correct outcome for a hard cap.
3. Catch the serialization failure specifically (Postgres error code `40001`) at the `placeOrder` level and map it to `CheckoutIneligibleError("This coupon just reached its redemption limit — please remove it and try again")`, giving the customer a clear, actionable message rather than a raw 500.
4. Apply the identical pattern to the `maxRedemptionsPerCustomer` check for logged-in customers (same transaction, same serializable isolation, checked alongside the global cap in one pass).

**Tests to Add:**
- `checkout.service.test.ts`: simulate concurrency by having a second `placeOrder` call's transaction mock reject with a Postgres `40001` serialization error, and assert it's mapped to `CheckoutIneligibleError` with the expected message, not a raw 500.
- `coupons.service.test.ts`: existing count-based validation tests continue to pass unchanged (this remains the early/non-authoritative check).
- Note as a gap: a fully mocked unit test cannot prove the serializable-isolation behavior actually prevents the race against a real database — recommend adding a narrow integration-test lane against a real Postgres instance specifically for this class of concurrency-dependent fix (check `apps/api`'s existing test setup for any such tier; none currently exists).

**Risk After Fix:** The redemption cap becomes a hard guarantee at the database level rather than an application-level best-effort check. Residual risk: serializable isolation increases the chance of transaction retries/aborts under genuinely high concurrency on a single popular coupon — the correct tradeoff for a promotional cap, but worth monitoring if a restaurant runs a very high-traffic, tightly-capped promotion.

---

## C-9 — No busy-driver check before assignment; a driver can be double-booked

**Root Cause:** `fulfillment.service.ts`'s `assignDriver` validates the target user is `RESTAURANT_STAFF` at the restaurant but never checks whether that `driverId` already holds another active (`OFFERED`/`ACCEPTED`/`EN_ROUTE`) `DriverAssignment` before upserting a new one. `countActiveDriverAssignments` exists but is restaurant-scoped (for the routing engine's concurrency cap), not driver-scoped.

**Files to Modify:**
- `apps/api/src/modules/commerce/fulfillment/fulfillment.service.ts` — `assignDriver`.
- `apps/api/src/modules/commerce/fulfillment/fulfillment.errors.ts` — add `DriverAlreadyBusyError`.
- `apps/api/src/modules/commerce/fulfillment/fulfillment.controller.ts` — `assignDriverHandler`'s catch chain.

**Exact Implementation Plan:**
1. Add a new query in `fulfillment.service.ts`: `countActiveAssignmentsForDriver(driverId)` — `prisma.driverAssignment.count({ where: { driverId, status: { in: ["OFFERED","ACCEPTED","EN_ROUTE"] } } })`, reusing the same status set already defined as `BUSY_DRIVER_ASSIGNMENT_STATUSES`.
2. In `assignDriver`, after the existing staff/tenant validation and before the `upsert`, call this new function and throw `DriverAlreadyBusyError` if the count is `> 0`, **unless** the caller is reassigning this exact `fulfillmentId`'s existing assignment to the same driver it's already on (a no-op reassignment should not be blocked by its own existing row — exclude the current `fulfillmentId`'s own assignment, if any, from the count).
3. Add `DriverAlreadyBusyError` to `assignDriverHandler`'s catch chain, mapping to `409` (conflict with current driver state, distinct from the existing `400` for "not on staff").
4. Document in the owner-facing dashboard's driver-assignment UI (`apps/web/src/app/dashboard/orders/[id]/page.tsx` or wherever driver assignment is triggered) that a busy-driver rejection should surface a clear "this driver already has an active delivery" message rather than a generic error.

**Tests to Add:**
- `fulfillment.service.test.ts`: assigning a driver who already has an `OFFERED` assignment on a *different* fulfillment throws `DriverAlreadyBusyError`.
- `fulfillment.service.test.ts`: reassigning the *same* `fulfillmentId` to the same driver it's already assigned to does not throw (idempotent no-op case).
- `fulfillment.service.test.ts`: assigning a driver with only `DELIVERED`/`DECLINED` (terminal) assignments succeeds normally.
- `fulfillment.controller.test.ts`: `DriverAlreadyBusyError` maps to `409`.

**Risk After Fix:** Double-booking via the assignment endpoint is closed. Residual risk: this doesn't prevent a staff member from *manually* reassigning a driver away from an in-progress delivery to take on a new one (a legitimate override use case) — the fix only blocks the case where the driver has no knowledge of being double-booked; explicit staff override remains possible and is intentionally not blocked here, since forcibly preventing all reassignment would be a UX regression for legitimate dispatch judgment calls.

---

## C-10 — No notification mechanism exists for a new driver offer; the system is poll-only

**Root Cause:** `assignDriver` never calls into the `notifications` module. Push and SMS provider stubs already exist (`notifications/providers/push.provider.ts`, `notifications/providers/sms.provider.ts`) and are registered in `notifications/registry.ts`, but nothing in the fulfillment module references them.

**Files to Modify:**
- `apps/api/src/modules/commerce/fulfillment/fulfillment.service.ts` — `assignDriver`.
- `apps/api/src/modules/commerce/notifications/notifications.service.ts` — add a new named convenience wrapper, `sendDriverAssignmentOfferNotification`.
- `apps/api/src/modules/commerce/customers/customers.errors.ts` / staff `User` model — confirm staff have a contactable phone/push-token field; if `User` has no phone field today, this fix's scope includes adding one (nullable, optional) since SMS is the most realistic channel for a driver who may not have the dashboard open.

**Exact Implementation Plan:**
1. Check `User`'s schema for an existing phone/notification-token field for staff; if absent, add `User.phone String?` via a small migration (nullable, opt-in — staff without a phone on file simply don't get SMS offers, falling back to poll-only for them specifically, which is a strict improvement over today's universal poll-only state).
2. Add `sendDriverAssignmentOfferNotification(fulfillmentId, restaurantId, driverPhone, orderNumber)` to `notifications.service.ts`, following the exact pattern of the seven existing convenience wrappers (uses the SMS provider from the registry, writes a `NotificationLog` row).
3. Call this new function from `assignDriver`, immediately after the `DriverAssignment` upsert succeeds, using the assigned driver's `User.phone` if present.
4. Since the SMS provider is currently a stub (`implemented: false` per the audit's POS/notifications findings — confirm this is accurate for SMS specifically, since email is the one real adapter today), this fix's realistic scope is: (a) wire the call site so the notification fires the moment a real SMS/push adapter exists, and (b) treat "no real adapter yet" as an explicit, tracked follow-up dependency rather than blocking this fix — the call site and data flow are the actual gap being closed here, and the audit's finding is about the *missing trigger*, not the provider implementation itself (which is separately scoped, out of this audit's Critical findings).
5. Apply the same unguarded-notification-failure caution from C-15/H-12 here: wrap this call so a notification failure never prevents the `DriverAssignment` row itself from being considered successfully created — the assignment must succeed even if the notification fails.

**Tests to Add:**
- `fulfillment.service.test.ts`: `assignDriver` calls `sendDriverAssignmentOfferNotification` with the correct driver/fulfillment/order details after a successful assignment.
- `fulfillment.service.test.ts`: a notification-send failure does not cause `assignDriver` itself to throw (mirrors the C-15/H-12 pattern).
- `notifications.service.test.ts`: `sendDriverAssignmentOfferNotification` follows the same `NotificationLog`-write and provider-dispatch pattern as the existing seven wrappers.

**Risk After Fix:** Once a real SMS/push adapter exists, drivers are notified the moment they're assigned rather than needing to poll. Residual risk, explicitly acknowledged: this fix closes the *code path* gap; it does not itself deliver a production SMS/push provider if one doesn't already exist as real (non-stub) infrastructure — confirm the real provider's status before considering this finding fully closed end-to-end, and track that separately if it's still a stub.

---

## C-11 — No timeout or automatic reassignment for an unanswered driver offer

**Root Cause:** `DriverAssignment` has no expiry/TTL field, and there is no scheduled job anywhere in the codebase that scans for and acts on stale `OFFERED` assignments.

**Files to Modify:**
- `apps/api/prisma/schema.prisma` — add `DriverAssignment.offerExpiresAt DateTime?`.
- `apps/api/src/modules/commerce/fulfillment/fulfillment.service.ts` — set `offerExpiresAt` on assignment; add `expireStaleOffers()`.
- `apps/api/src/modules/commerce/fulfillment/fulfillment.controller.ts` / a new lightweight scheduler entry point.
- `apps/api/src/index.ts` (or wherever the process's background-job wiring, if any, currently lives — verify at implementation time; if none exists yet, this fix introduces the first one).

**Exact Implementation Plan:**
1. Migration: add nullable `offerExpiresAt` on `DriverAssignment`.
2. In `assignDriver`, set `offerExpiresAt: new Date(Date.now() + OFFER_TIMEOUT_MS)` (a configurable constant, default e.g. 3 minutes) whenever a new assignment is created with `status: "OFFERED"`.
3. Add `expireStaleOffers(): Promise<{ expiredCount: number }>` to `fulfillment.service.ts` — finds `DriverAssignment` rows with `status: "OFFERED"` and `offerExpiresAt < now()`, transitions each to a new terminal-ish state (reuse `DECLINED` semantically, or add a distinct `EXPIRED` value to `DriverAssignmentStatus` if the state machine benefits from distinguishing "the driver said no" from "the driver never answered" — recommended, since staff dispatch response differs for the two cases), and writes an `OrderEvent`/notification alerting staff that the fulfillment needs manual reassignment.
4. Wire `expireStaleOffers` to run on an interval (Node `setInterval` at process start is sufficient for this codebase's current single-process deployment model — do not over-engineer a distributed scheduler here; note that this approach has the same single-instance limitation flagged for the event bus in H-11, and should be revisited together with that fix if/when the deployment becomes multi-instance).
5. Surface fulfillments whose driver assignment just expired prominently in the owner/staff dashboard (`apps/web/src/app/dashboard/orders/page.tsx` or the kitchen queue view) — this fix's backend half is incomplete without the staff-visible signal that manual intervention is needed.

**Tests to Add:**
- `fulfillment.service.test.ts`: `assignDriver` sets `offerExpiresAt` correctly relative to the configured timeout.
- `fulfillment.service.test.ts`: `expireStaleOffers` transitions only `OFFERED` assignments past their `offerExpiresAt`, leaves `ACCEPTED`/`EN_ROUTE` untouched regardless of age, and is a no-op when nothing is stale.
- `fulfillment.service.test.ts`: an expired offer triggers a staff-facing event/notification.

**Risk After Fix:** Offers no longer hang indefinitely — the maximum time an order can be silently stuck is bounded by the configured timeout. Residual risk: the `setInterval`-based scheduler is process-local and will miss expirations during a deploy/restart window, and won't run at all if the process is down — acceptable for the current single-instance deployment, but flagged as needing revisit if/when horizontal scaling is introduced (see H-11's cross-reference).

---

## C-12 — Delivery zone geometry (polygon and radius containment) is dead code in the actual routing decision

**Root Cause:** `smart-routing.ts`'s `evaluateRouting` accepts `deliveryZones` in `RoutingInput` and the production caller (`quote.service.ts`) fetches and passes real zone data, but the function body never references `input.deliveryZones`. `resolveRuleChain` only ever compares `distanceMiles` against a rule's `minDistanceMiles`/`maxDistanceMiles`; `DeliveryRule.zoneId` is persisted and never read back. The independently-tested containment functions (`geometry.ts`'s `isPointInZone`/`isPointInPolygonZone`/`isPointInRadiusZone`) are called only from their own unit tests.

**Files to Modify:**
- `apps/api/src/modules/commerce/delivery-rules/smart-routing.ts` — `RoutingInput`, `resolveRuleChain`, `evaluateRouting`.
- `apps/api/src/modules/commerce/checkout/quote.service.ts` — pass the delivery address's `lat`/`lng` into `evaluateRouting`.

**Exact Implementation Plan:**
1. Extend `RoutingInput` with `deliveryLat?: number` and `deliveryLng?: number` — `quote.service.ts` already fetches the `CustomerAddress` row (it needs `address.lat`/`address.lng` for the existing `distanceMilesBetween` call) so this is passing an already-available value through, not a new fetch.
2. In `resolveRuleChain`, when a candidate rule has a non-null `zoneId`, look up the corresponding `DeliveryZone` from the `deliveryZones` array (already passed into `evaluateRouting`, just build a `Map` from it the same way `byId` is built for rules) and require `isPointInZone(zone, deliveryLat, deliveryLng)` to be `true` in addition to the existing distance-band check before the rule is considered a match. A rule with a `zoneId` whose zone doesn't contain the point should be skipped (continue to the next rule in priority order), exactly like a distance-band miss is skipped today.
3. Thread `deliveryLat`/`deliveryLng` through `evaluateRouting`'s call to `resolveRuleChain` (the function signature needs both new parameters).
4. Handle the case where `deliveryLat`/`deliveryLng` are `undefined` (e.g., an address that was never geocoded) by treating any zone-scoped rule as non-matching for that request (fail closed — a rule requiring zone containment cannot be evaluated without a point, so it should not match) while distance-only rules (no `zoneId`) continue to work exactly as they do today.

**Tests to Add:**
- `smart-routing.test.ts`: a rule with a `zoneId` whose polygon does **not** contain the delivery point is skipped even though the distance band matches (this is the key regression test the audit specifically calls out as currently missing — today's tests only ever pass an empty `deliveryZones` array).
- `smart-routing.test.ts`: a rule with a `zoneId` whose polygon **does** contain the point is selected.
- `smart-routing.test.ts`: a rule with no `zoneId` (pure distance-band rule) is unaffected by the presence of unrelated zones in `deliveryZones`.
- `smart-routing.test.ts`: `deliveryLat`/`deliveryLng` both `undefined` causes zone-scoped rules to be skipped, not to throw.
- `quote.service.test.ts`: confirms `evaluateRouting` is called with the address's `lat`/`lng` correctly threaded through.

**Risk After Fix:** Polygon/radius zones become load-bearing in the actual routing decision, matching the feature's advertised behavior. Residual risk: none specific to this fix beyond the general caution that zone geometry authored by restaurant owners (via the dashboard zone editor) should be spot-checked for validity (self-intersecting polygons, etc.) — input validation on zone creation is a separate, not-yet-audited concern worth a quick follow-up look, not part of this fix's scope.

---

## C-13 — QR table binding can be forged directly, bypassing the token entirely

**Root Cause:** `cart.validation.ts`'s `createCartSchema` and `setFulfillmentSchema` both accept a raw client-supplied `tableId: z.uuid().optional()`. `cart.controller.ts`'s `createCartHandler` and `cart.service.ts`'s `setCartFulfillment` write this value onto the `Cart` row with no verification that it belongs to the target restaurant, is active, or was ever resolved via `GET /api/public/tables/:qrToken`.

**Files to Modify:**
- `apps/api/src/modules/commerce/cart/cart.validation.ts` — remove `tableId` from both client-facing schemas.
- `apps/api/src/modules/commerce/cart/cart.controller.ts` — `createCartHandler`, and any fulfillment-update handler that currently forwards a client `tableId`.
- `apps/api/src/modules/commerce/cart/cart.service.ts` — `getOrCreateActiveCart`, `setCartFulfillment` signatures.
- `apps/api/src/modules/commerce/qr-ordering/tables.service.ts` — no change needed to `resolveTableByToken` itself; it already correctly resolves server-side.
- `apps/web/src/app/order/qr/[qrToken]/page.tsx` — update the call shape to match the new server-side-only binding mechanism (see step 3 below).

**Exact Implementation Plan:**
1. Remove `tableId` entirely from `createCartSchema` and `setFulfillmentSchema` — it must never again be a client-supplied field on these two request bodies.
2. Add a **new, dedicated endpoint**: `POST /api/public/cart/:cartId/bind-table` accepting `{ qrToken: string }` in the body (not a `tableId`). The handler calls the existing, already-correct `resolveTableByToken(qrToken)` to get the real `Table` row server-side, verifies the resolved table's `restaurantId` matches the cart's `restaurantId` (reject with a clear error if not — this is the cross-restaurant case the audit specifically flags), and only then sets `Cart.tableId`/`Cart.fulfillmentType = "DINE_IN"` from the **server-resolved** table, never from anything the client sent directly.
3. Update the QR landing page (`apps/web/src/app/order/qr/[qrToken]/page.tsx`) to call `createCart` (without `tableId`) followed immediately by the new `bind-table` endpoint (passing the `qrToken` from the URL, not a `tableId` it derived itself) — this keeps the "resolve via token, never via raw ID" invariant intact end-to-end, including in the one legitimate caller.
4. Audit every other caller of `createCartSchema`/`setFulfillmentSchema` (the regular, non-QR checkout flow) to confirm none of them ever needed to set `tableId` directly — per the QR-ordering design, they never should have.

**Tests to Add:**
- `cart.controller.test.ts`: `createCartHandler` no longer accepts/persists a client-supplied `tableId` even if one is included in the request body (assert it's silently ignored / rejected by the now-stricter schema, not merely unused).
- New `cart.controller.test.ts` (or a new `bind-table.controller.test.ts`) coverage: binding with a valid `qrToken` for a table belonging to the cart's own restaurant succeeds and sets `Cart.tableId` to the server-resolved table's id.
- New test: binding with a `qrToken` that resolves to a table belonging to a **different** restaurant than the cart's is rejected with a clear error and does not mutate the cart — this is the direct regression test for the cross-restaurant misattribution scenario the audit describes.
- New test: binding with an invalid/deactivated `qrToken` is rejected (reuses `InvalidQrTokenError` from `resolveTableByToken`, already tested there).
- `qr-ordering`/`cart` integration test: the full QR landing-page flow (create cart → bind via token) end to end, asserting no path exists to set `tableId` without going through `resolveTableByToken`.

**Risk After Fix:** The QR token becomes genuinely the sole authorization path for table binding, matching the schema's documented intent. Residual risk: token regeneration (already correct) now also meaningfully revokes an already-known `tableId`'s ability to bind new carts, since binding always re-resolves — this closes the secondary gap the audit noted (regeneration being moot given the bypass); no further action needed there once this fix lands.

---

## C-14 — No ownership check on cart or order endpoints (IDOR)

**Root Cause:** `cart.service.ts`'s `getCartWithItems(cartId)` — and every handler built on it in `cart.controller.ts` — resolves the cart purely by the `cartId` path/body parameter, with no comparison against the caller's resolved identity (`resolveCartIdentity`, which today is only actually invoked inside `applyCouponHandler`, not as a general gate). The same gap allows `checkout.controller.ts`'s `placeOrderHandler` to place an order against any cart it's given, regardless of who the caller is.

**Files to Modify:**
- `apps/api/src/modules/commerce/cart/cart.controller.ts` — every handler (`getCartHandler`, `addCartItemHandler`, `updateCartItemHandler`, `removeCartItemHandler`, `setFulfillmentHandler`, `applyCouponHandler`, `removeCouponHandler`).
- `apps/api/src/modules/commerce/cart/cart.service.ts` — `getCartWithItems` (or a new ownership-checking wrapper around it).
- `apps/api/src/modules/commerce/cart/cart.errors.ts` — `CartNotFoundError` is already the correct error to reuse (ownership mismatch should look identical to "doesn't exist," per this codebase's own consistent 404-not-403 tenant-isolation convention — apply the same principle to identity isolation).
- `apps/api/src/modules/commerce/checkout/checkout.controller.ts` — `placeOrderHandler`, `getQuoteHandler`.

**Exact Implementation Plan:**
1. Add a shared helper in `cart.controller.ts` (or promote it into `cart.service.ts` if other modules will need it): `assertCartOwnership(cart: Cart, identity: CartIdentity): void` — throws `CartNotFoundError` if `identity.customerId` is set and doesn't match `cart.customerId`, or if `identity.guestSessionId` is set and doesn't match `cart.guestSessionId`. Note the deliberate choice of `CartNotFoundError` (404) rather than a 403 — this mirrors the codebase's existing, explicit tenant-isolation convention of never revealing a resource's existence to a caller who doesn't own it, extended here to the identity axis.
2. In every cart handler, call `resolveCartIdentity(req, res)` (already defined, currently underused) and `assertCartOwnership(cart, identity)` immediately after fetching the cart and before performing any read or mutation. This must run even for `getCartHandler` (currently a pure read) since a cart's contents (items, coupon, delivery address selection) are themselves sensitive.
3. In `checkout.controller.ts`'s `getQuoteHandler` and `placeOrderHandler`, apply the identical check — resolve identity, fetch the cart, assert ownership, *then* proceed with quote computation / order placement.
4. For the guest case specifically: a guest's `guestSessionId` comes from an httpOnly cookie the guest's own browser holds — this means a guest who genuinely lost/cleared their cookie legitimately cannot access their old cart anymore, which is expected behavior (this is the intended security property, not a regression) and matches how the guest-session mechanism was designed to work.

**Tests to Add:**
- `cart.controller.test.ts`: each handler, given a cart whose `customerId`/`guestSessionId` doesn't match the resolved caller identity, returns 404 and performs no mutation (assert the underlying service function, e.g. `addCartItem`, `updateCartItemQuantity`, is never called).
- `cart.controller.test.ts`: the existing happy-path tests (matching identity) continue to pass unchanged.
- `checkout.controller.test.ts`: `getQuoteHandler`/`placeOrderHandler` reject a cart belonging to a different identity with 404, and never call `computeCheckoutQuote`/`placeOrder`.
- New explicit regression test named for this finding: a customer's `cartId` used by a second, different authenticated customer (both real, distinct `customerId`s) is rejected — this is the specific IDOR shape called out in the audit, not just the guest case.

**Risk After Fix:** Direct object-reference access to another identity's cart or order-placement capability is closed. Residual risk: this fix does not (and per the audit's own scoping, should not) change the *public order-tracking* endpoint's model, which is intentionally bearer-token-style by current design (see M-12 for that endpoint's own, separately-scoped fix) — cart ownership and post-order tracking are different security models and this fix only addresses the former.

---

## C-15 — Notification failure after payment capture surfaces as a 500 to an already-charged customer

**Root Cause:** This finding is the concrete, most-likely real-world trigger for C-2 — see C-2's Root Cause and fix for the actual code change. It is tracked as its own ID because it identifies the specific failure mode (a `NotificationLog` write failure inside `sendOrderConfirmation`, called unguarded immediately after successful capture) rather than the general idempotency-retry mechanism.

**Files to Modify:** Identical to C-2 — `apps/api/src/modules/commerce/checkout/checkout.service.ts`. No separate change is required beyond C-2's fix; this entry exists to make explicit that C-2's test plan must include the notification-failure trigger specifically, not just an abstract "some post-payment step throws" case.

**Exact Implementation Plan:**
1. Implement C-2's fix (post-payment side effects caught-and-logged internally, never rethrown from `placeOrder`).
2. As part of that fix's verification, specifically exercise the trigger described here: mock `sendOrderConfirmation` (or, more precisely, the underlying `notifications.service.ts`'s `sendNotification`/`prisma.notificationLog.create`) to throw, and confirm the customer-facing response is still a clean success, not a 500.
3. No additional code changes beyond C-2 are anticipated; if implementation reveals a reason C-15 needs independent handling beyond what C-2 already covers, treat that as a signal C-2's fix was incomplete, not as a reason to build a parallel fix here.

**Tests to Add:** Covered by C-2's test plan — specifically the test case "`sendOrderConfirmation` throws after successful capture; `placeOrder` still resolves successfully."

**Risk After Fix:** Same as C-2 — closing this specific trigger is what makes C-2's fix verifiably complete, not an independent residual risk.

---

# Sprint 07.7 — High Priority Fixes

## H-2 — `markPaidCash` can double-book cash revenue

**Root Cause:** `orders.service.ts`'s `markPaidCash` is the only order-lifecycle action that bypasses the shared `transition()` helper (which calls `assertValidOrderTransition`); it doesn't check `order.paymentStatus` before writing, and its route has no `requireIdempotencyKey` middleware.

**Files to Modify:**
- `apps/api/src/modules/commerce/orders/orders.service.ts` — `markPaidCash`.
- `apps/api/src/modules/commerce/orders/orders.routes.ts` — the `mark-paid` route.
- `apps/api/src/middleware/require-idempotency-key.ts` — no change needed, reused as-is.

**Exact Implementation Plan:**
1. In `markPaidCash`, add a guard at the top: `if (order.paymentStatus === "PAID") return order;` (idempotent no-op on repeat calls with the same effect already applied) — cheaper and simpler than routing this specific action through the full state-machine `transition()` helper, since `paymentStatus` (not `Order.status`) is what's being guarded here, and `Order.status` transitions aren't involved in this action at all.
2. Add `requireIdempotencyKey` to `PATCH /me/orders/:id/mark-paid` in `orders.routes.ts`, matching the pattern already used on checkout's `place-order` route.
3. Update `orders.controller.ts`'s `markPaidHandler` to read `req.idempotencyKey` and wrap the call in the same `reserveIdempotencyKey`/`completeIdempotencyKey`/`failIdempotencyKey` pattern `checkout.controller.ts` already uses, scoped to endpoint `"orders.markPaidCash"`.

**Tests to Add:**
- `orders.service.test.ts`: calling `markPaidCash` twice on an order already `paymentStatus: "PAID"` is a no-op the second time — asserts `prisma.transaction.create` is called exactly once across both calls.
- `orders.controller.test.ts`: the idempotency-key reservation/completion flow mirrors the existing `checkout.controller.test.ts` coverage for the same pattern.

**Risk After Fix:** Double-booking via retry/double-click is closed. Residual risk: none specific to this fix — it's a direct, self-contained application of a pattern already proven correct elsewhere in the codebase.

---

## H-3 — Raw provider error messages leak to the public checkout endpoint (card-testing oracle)

**Root Cause:** `stripe.provider.ts`'s `authorize()` returns Stripe's raw `err.message`/`err.code`/`decline_code` as `failureMessage`/`failureCode`. This propagates through `orchestrator.ts` (`NoAvailableProviderError(lastFailure?.failureMessage)`) to `checkout.service.ts` (`PaymentFailedError(err.message)`) to `checkout.controller.ts`'s public, unauthenticated `place-order` response.

**Files to Modify:**
- `apps/api/src/modules/commerce/payments/payments.errors.ts` — `PaymentFailedError`/`NoAvailableProviderError`.
- `apps/api/src/modules/commerce/checkout/checkout.controller.ts` — the error-to-response mapping in `placeOrderHandler`.
- `apps/api/src/modules/commerce/payments/providers/stripe.provider.ts` — no change to what's captured internally (the raw detail should still be logged server-side), only to what's exposed externally.

**Exact Implementation Plan:**
1. Keep the raw provider `failureMessage`/`failureCode` flowing internally through `orchestrator.ts` and stored on the `PaymentAttempt` row (this detail is valuable for staff/ops debugging and should not be lost).
2. At the `checkout.controller.ts` boundary specifically — the one place this reaches an unauthenticated public client — replace the raw message with a small, fixed mapping from a short allowlist of safe, generic categories (e.g., "Your card was declined," "This payment method could not be processed," "Payment failed, please try a different method") rather than ever forwarding `err.message` verbatim. Do this by having `PaymentFailedError` carry both a `detail` (raw, for logging) and a `publicMessage` (safe, for the response), and having the controller use only `publicMessage` when constructing the JSON response, while logging `detail` server-side.
3. Apply the identical treatment anywhere else a provider-originated message could reach a public response — audit `orchestrator.ts`'s `NoAvailableProviderError` construction site for the same pattern.

**Tests to Add:**
- `checkout.controller.test.ts`: a `PaymentFailedError` constructed with a raw Stripe decline message produces a response body containing only the generic `publicMessage`, never the raw provider text (assert on the exact response body, not just status code).
- `payments.errors.test.ts` (new, if one doesn't exist): `PaymentFailedError`'s `publicMessage` defaults sensibly when no specific category is known.
- Add a lint-adjacent test/check (or a code-review checklist item, if a runtime test isn't practical) confirming no other public controller ever serializes a raw `err.message` from a caught provider error — this class of leak is easy to reintroduce elsewhere without a structural guard.

**Risk After Fix:** The card-testing oracle is closed for the checkout endpoint specifically. Residual risk: this is a targeted fix at the current known leak point; the "audit every other public error response for the same pattern" step in the implementation plan is important and should not be skipped, since the same mistake is easy to make in any future public-facing error path.

---

## H-4 — No refund idempotency and no over-refund guard

**Root Cause:** `POST /me/orders/:id/refund` has no `requireIdempotencyKey` middleware. `orchestrator.ts`'s `refundOrderPayment` never validates `input.amountCents` against `payment.capturedAmountCents - payment.refundedAmountCents` before calling the provider.

**Files to Modify:**
- `apps/api/src/modules/commerce/orders/orders.routes.ts` — the refund route.
- `apps/api/src/modules/commerce/orders/orders.controller.ts` — `refundHandler`.
- `apps/api/src/modules/commerce/payments/orchestrator.ts` — `refundOrderPayment`.
- `apps/api/src/modules/commerce/payments/payments.errors.ts` — add `RefundExceedsRemainingBalanceError`.

**Exact Implementation Plan:**
1. Add `requireIdempotencyKey` to the refund route, and wrap `refundHandler` in the same `reserveIdempotencyKey`/`completeIdempotencyKey`/`failIdempotencyKey` pattern used elsewhere, scoped to endpoint `"orders.refund"`.
2. In `refundOrderPayment`, before calling `adapter.refund(...)`, compute `remaining = payment.capturedAmountCents - payment.refundedAmountCents` and throw `RefundExceedsRemainingBalanceError` if `input.amountCents > remaining`, so the application enforces this invariant itself rather than relying entirely on the provider to reject an over-refund.
3. Add `RefundExceedsRemainingBalanceError` to `orders.controller.ts`'s `refundHandler` catch chain, mapping to `422`.

**Tests to Add:**
- `orders.controller.test.ts`: refund idempotency mirrors the existing checkout/mark-paid pattern — a repeated request with the same key returns the cached response without calling `refundOrderPayment` a second time.
- `orchestrator.test.ts`: a refund request for more than the remaining refundable balance throws `RefundExceedsRemainingBalanceError` before ever calling `adapter.refund`.
- `orchestrator.test.ts`: a refund request exactly equal to the remaining balance succeeds (boundary case).

**Risk After Fix:** Both a double-submitted refund and an over-refund are now caught at the application layer rather than relying solely on the provider. Residual risk: none specific — this closes the gap the codebase's own idempotency-key design already intended to cover for this endpoint.

---

## H-5 — Guest coupon redemption limits are entirely unenforceable

**Root Cause:** `coupons.service.ts`'s per-customer redemption check only runs `if (customerId && ...)`. Guests have no stable identity passed into validation, and `checkout.service.ts` creates a brand-new `GuestCustomer` row on every guest order with no lookup-by-email reuse.

**Files to Modify:**
- `apps/api/src/modules/commerce/checkout/checkout.service.ts` — the guest-customer creation block inside `placeOrder`'s transaction.
- `apps/api/src/modules/commerce/coupons/coupons.service.ts` — `validateCouponForRedemption`.

**Exact Implementation Plan:**
1. This requires guests to have *some* durable identity for coupon-limiting purposes without requiring full account creation. The most contained fix: before creating a new `GuestCustomer` row in `placeOrder`, look up an existing `GuestCustomer` by `email` for this restaurant (add a query: `tx.guestCustomer.findFirst({ where: { email: input.guestEmail } })`); reuse the existing row's id if found, only creating a new one if none exists. This directly also improves M-10 (no guest-order-to-customer linking) as a side effect, since guest orders under the same email now consistently share one `GuestCustomer` id.
2. With guest identity now stable across orders (by email), extend `validateCouponForRedemption`'s per-customer check to also run for guests, keyed by the resolved `guestCustomerId` rather than only `customerId` — the function's signature needs a second optional identity parameter (`guestCustomerId?: string`) alongside the existing `customerId?: string`, checked with the same logic.
3. Document clearly (in a code comment on `validateCouponForRedemption`) that this limits redemption *by email address*, which is a meaningfully weaker guarantee than a verified account (a guest can still use a different email each time) — this fix closes the "same guest, same email, unlimited redemptions" gap specifically called out as already-acknowledged in the existing test suite; it does not and cannot fully close "an attacker willing to use N different email addresses," which would require an account/verification requirement to redeem per-customer-limited coupons, a larger product decision out of scope here.

**Tests to Add:**
- `coupons.service.test.ts`: a guest with a `guestCustomerId` matching a prior redemption is blocked by the per-customer limit, same as a logged-in customer today.
- `checkout.service.test.ts`: two orders placed as a guest with the same email reuse the same `GuestCustomer` row (assert `tx.guestCustomer.create` is called at most once across both orders, `tx.guestCustomer.findFirst` finds the existing row on the second).
- Update the existing test that currently documents "skips the per-customer check entirely for a guest" — this test's expected behavior changes as part of this fix; do not leave it asserting the old (now-fixed) behavior.

**Risk After Fix:** Per-customer coupon limits are enforced for guests using the same email, closing the primary reported abuse pattern (repeat checkout without creating an account). Residual risk, explicitly acknowledged: this is an email-keyed limit, not an identity-verified one — a determined abuser using many distinct email addresses is not blocked by this fix, and closing that fully would require requiring account verification for per-customer-limited coupons, a separate product decision.

---

## H-6 — No password reset or change mechanism for customer accounts

**Root Cause:** `customers/index.routes.ts` only wires register/login/refresh/logout/me — no reset or change-password flow exists anywhere in the module.

**Files to Modify:**
- `apps/api/prisma/schema.prisma` — add a `CustomerPasswordResetToken` model (`id`, `customerId` FK, `tokenHash`, `expiresAt`, `usedAt DateTime?`, `createdAt`), mirroring the general shape of the staff-auth `RefreshToken` model's opaque-hashed-token pattern.
- `apps/api/src/modules/commerce/customers/customers.service.ts` — `requestPasswordReset`, `resetPassword`, `changePassword`.
- `apps/api/src/modules/commerce/customers/customers.validation.ts` — new schemas.
- `apps/api/src/modules/commerce/customers/customers.controller.ts` — new handlers.
- `apps/api/src/modules/commerce/customers/index.routes.ts` — new routes under `authRouter`.
- `apps/api/src/modules/commerce/notifications/notifications.service.ts` — add `sendPasswordResetEmail`.

**Exact Implementation Plan:**
1. `POST /api/customer/auth/password-reset/request` — accepts `{ email }`, always responds `200` regardless of whether the email matches an account (standard enumeration-prevention practice), and if it does match, generates a high-entropy token (reuse the same `randomBytes`-based approach already used for `qr-token.ts`/guest-session), stores only its hash in `CustomerPasswordResetToken`, sets a short expiry (e.g. 1 hour), and emails a reset link via the new `sendPasswordResetEmail` wrapper.
2. `POST /api/customer/auth/password-reset/confirm` — accepts `{ token, newPassword }`, looks up the token by hash, rejects if expired/already used/not found (generic error, no distinction between those cases in the response), hashes and updates `Customer.passwordHash`, marks the token `usedAt`, and — importantly — invalidates all of the customer's existing refresh tokens as part of the same operation (this fix's scope depends on H-7's `CustomerRefreshToken` table existing; sequence this after H-7, or land a minimal version here and revisit once H-7 lands).
3. `POST /api/customer/auth/change-password` (authenticated, `requireCustomerAuth`) — accepts `{ currentPassword, newPassword }`, re-verifies `currentPassword` against the stored hash before allowing the change, same refresh-token invalidation as step 2.
4. Rate-limit the reset-request endpoint with `customerAuthRateLimiter` (already exists) to prevent email-bombing via repeated reset requests.

**Tests to Add:**
- `customers.service.test.ts`: reset-request always returns success regardless of whether the email exists (no timing/response-shape difference an attacker could use to enumerate accounts).
- `customers.service.test.ts`: reset-confirm rejects an expired token, a used token, and an unknown token, all with the same generic error.
- `customers.service.test.ts`: a successful reset updates the password hash and invalidates existing sessions.
- `customers.service.test.ts`: change-password rejects an incorrect `currentPassword`.
- `customers.controller.test.ts`: routing/validation coverage for all three new endpoints.

**Risk After Fix:** Customers gain a real account-recovery path. Residual risk: email delivery depends on the notifications module's real email adapter being correctly configured for the environment — if email delivery itself is unreliable, the reset flow inherits that unreliability; this fix does not change the notifications module's own delivery guarantees (see the Future Improvements section for notification-reliability work).

---

## H-7 — Customer refresh tokens have no server-side revocation and survive logout

**Root Cause:** `customer-jwt.ts`'s refresh tokens are self-contained 30-day JWTs with no backing database table, unlike staff auth's opaque, DB-tracked `RefreshToken`. `customers.controller.ts`'s `logoutHandler` only clears cookies.

**Files to Modify:**
- `apps/api/prisma/schema.prisma` — add `CustomerRefreshToken` (`id`, `customerId` FK, `tokenHash`, `expiresAt`, `revokedAt DateTime?`, `createdAt`), mirroring staff auth's existing `RefreshToken` model shape as closely as practical.
- `apps/api/src/modules/commerce/customers/customer-jwt.ts` — `signCustomerRefreshToken`/`verifyCustomerRefreshToken`.
- `apps/api/src/modules/commerce/customers/customers.service.ts` — token issuance/rotation/revocation helpers.
- `apps/api/src/modules/commerce/customers/customers.controller.ts` — `loginHandler`, `refreshHandler`, `logoutHandler`.

**Exact Implementation Plan:**
1. Change refresh-token issuance from "sign a self-contained JWT and hand it to the client" to the staff-auth pattern: generate a high-entropy opaque token, store only its hash plus `customerId`/`expiresAt` in the new `CustomerRefreshToken` table, and give the client the raw (unhashed) token as the cookie value.
2. `refreshHandler` looks up the presented token by hash, rejects if not found/expired/`revokedAt` set, and — for defense against token replay after theft — rotates it: issues a new opaque token, marks the old row `revokedAt`, and creates a new row (this mirrors the staff-auth "reuse detection" spirit even if a full reuse-detection alarm system is out of scope for this fix).
3. `logoutHandler` now has something real to do: look up the presented refresh token by hash and set `revokedAt`, in addition to clearing cookies — this is the change that actually closes the finding (today logout is purely cosmetic from the token's perspective).
4. Wire the password-reset/change-password flows from H-6 to call a new `revokeAllCustomerRefreshTokens(customerId)` helper as part of their completion.
5. Keep `signCustomerAccessToken`/`verifyCustomerAccessToken` (the short-lived access token) unchanged — this fix is scoped to the refresh token only, matching the audit's finding.

**Tests to Add:**
- `customers.service.test.ts` / `customer-jwt.test.ts`: a refresh token is stored hashed, never in plaintext, in the database.
- `customers.controller.test.ts`: `logoutHandler` revokes the presented refresh token; a subsequent `refreshHandler` call with the same (now-revoked) token is rejected.
- `customers.controller.test.ts`: `refreshHandler` rotates the token on each use — the old token is rejected on a second use (replay protection).
- `customers.service.test.ts`: `revokeAllCustomerRefreshTokens` invalidates every active token for a customer.

**Risk After Fix:** A customer (or the platform, in response to a suspected compromise) can now actually invalidate a refresh token. Residual risk: this fix does not add anomaly-based reuse-*detection* (e.g., alerting when a revoked/rotated-away token is presented, which typically indicates theft) — it adds revocation and rotation, which is the core gap the audit identified; full reuse-detection parity with staff auth's more elaborate design is a reasonable future enhancement, not required to close this specific finding.

---

## H-8 — Silent driver reassignment gives the original driver no notice

**Root Cause:** `assignDriver` upserts on `fulfillmentId`, so reassigning a delivery to a different driver overwrites the same `DriverAssignment` row rather than notifying the previously-assigned driver.

**Files to Modify:**
- `apps/api/src/modules/commerce/fulfillment/fulfillment.service.ts` — `assignDriver`.
- `apps/api/src/modules/commerce/notifications/notifications.service.ts` — reuse `sendDriverAssignmentOfferNotification`'s infrastructure from C-10, or add a sibling `sendDriverReassignedAwayNotification`.

**Exact Implementation Plan:**
1. In `assignDriver`, before performing the upsert, check whether an existing `DriverAssignment` row for this `fulfillmentId` already exists with a **different** `driverId` than the one being assigned now (and is still in a non-terminal status).
2. If so, after the upsert completes, send a notification to the *previous* driver (using the same SMS/push infrastructure built for C-10) explicitly stating this delivery has been reassigned and is no longer theirs — this is a small, additive step once C-10's notification plumbing exists, so sequence this fix after C-10.
3. Apply the same "notification failure must not block the core operation" guard used throughout this plan (C-10, C-15/H-12).

**Tests to Add:**
- `fulfillment.service.test.ts`: reassigning a fulfillment from driver A to driver B triggers a "reassigned away" notification to driver A, and a "new offer" notification to driver B.
- `fulfillment.service.test.ts`: assigning a fulfillment that previously had no driver at all only sends the new-offer notification, not a reassignment notification (no false positive on the first assignment).

**Risk After Fix:** A reassigned driver is explicitly told, closing the "job silently vanished" confusion. Residual risk: depends on C-10's underlying notification channel actually being live (same caveat as C-10) — the code path is correct regardless, but real-world effectiveness depends on that dependency.

---

## H-9 — Delivery-rule fallback chains are not re-validated for busy state, and can be self-referencing

**Root Cause:** `smart-routing.ts`'s `resolveRuleChain` returns a `RESTAURANT_DRIVER` rule's fallback unconditionally when the primary is busy, without re-checking whether the fallback is also `RESTAURANT_DRIVER` and also over the concurrency limit. `zones.service.ts`'s `validateFallback` never checks `fallbackToRuleId !== id`.

**Files to Modify:**
- `apps/api/src/modules/commerce/delivery-rules/smart-routing.ts` — `resolveRuleChain`.
- `apps/api/src/modules/commerce/delivery-rules/zones.service.ts` — `validateFallback`.
- `apps/api/src/modules/commerce/delivery-rules/delivery-zones.errors.ts` — the existing `InvalidFallbackRuleError` is reusable for the new self-reference case (no new error type needed).

**Exact Implementation Plan:**
1. In `resolveRuleChain`, when following a `fallbackToRuleId`, re-apply the exact same busy-check condition (`fallback.fulfillmentMethod === "RESTAURANT_DRIVER" && activeDriverCount >= maxConcurrent`) to the fallback before returning it. If the fallback is *also* busy, treat it the same as the primary being unavailable — attempt *its* fallback if it has one (bounded — see step 2 for cycle protection), or fall through to `continue` in the outer loop if not.
2. Since fallback chains could in principle be long (A→B→C→...), bound the chain-following to a small fixed depth (e.g., 5 hops) to avoid pathological configurations causing excessive lookups, even though `validateFallback` (with step 3 below) prevents true cycles going forward — this is defense in depth against any pre-existing bad data.
3. In `zones.service.ts`'s `validateFallback`, add a check that `fallbackToRuleId !== id` (self-reference) and, ideally, a shallow check that following the fallback chain from the new rule doesn't loop back to itself within the bounded depth from step 2 — reject with `InvalidFallbackRuleError` if it does. Apply this validation on both `createRule` and `updateRule`.

**Tests to Add:**
- `smart-routing.test.ts`: a fallback rule that is itself `RESTAURANT_DRIVER` and also over the concurrency limit is **not** selected — the chain continues past it (this is the specific regression test the audit calls out as currently missing, since the existing test only covers a fallback of a *different* method).
- `smart-routing.test.ts`: a fallback rule that is `RESTAURANT_DRIVER` but *under* the limit is correctly selected (positive case, already covered — confirm it still passes after the fix).
- `zones.service.test.ts`: `updateRule`/`createRule` reject a rule configured with `fallbackToRuleId` pointing at itself.
- `zones.service.test.ts`: (if the multi-hop cycle check from step 3 is implemented) a two-rule mutual-fallback cycle (A→B, B→A) is rejected when the second edge is added.

**Risk After Fix:** The concurrency cap can no longer be silently bypassed via same-method or self-referencing fallback chains. Residual risk: the chain-depth bound (step 2) is a safety net, not expected to be exercised in practice once step 3's creation-time validation is in place — if it ever does trigger, it degrades to "treat as no eligible rule found" rather than an infinite loop, which is the correct fail-safe behavior.

---

## H-10 — The event bus has zero production subscribers today

**Root Cause:** `commerceEventBus.on()` is called nowhere in production code — confirmed by a repo-wide search finding only the bus's own unit test as a caller. Every `emitOrderEvent()` call throughout checkout/orders is emitted into a bus with no listeners.

**Files to Modify:** None strictly required to "fix" this finding in isolation — it is not a bug on its own (see the audit's own framing: inert, not broken). This entry's implementation plan is scoped to making the situation explicit and safe rather than silently misleading, pending the durability work in H-11.

**Exact Implementation Plan:**
1. Add a code comment at the top of `apps/api/src/modules/commerce/events/event-bus.ts` explicitly stating the bus currently has no production subscribers, and that any future subscriber must first confirm H-11's durability work (or an explicit scoping decision to accept single-instance-only semantics) before being added, so the next engineer who reads the emission call sites throughout `checkout.service.ts`/`orders.service.ts` isn't misled into assuming the architecture is more complete than it is.
2. Do not add speculative subscribers as part of this fix — that would be scope creep beyond what Sprint 07.7 calls for. This finding's "fix" for this sprint is documentation-and-guardrail only; real subscribers are a Sprint 08+ feature-by-feature decision, each of which should explicitly reference H-11's resolution status at the time it's built.
3. As a lightweight verification step (not a subscriber): add one minimal internal subscriber purely for observability — a debug-level log line on every emitted event — so that in a running environment, it's possible to confirm the bus is actually receiving the emissions its callers believe it is (useful both now, to validate this finding's premise, and later, as a sanity check when real subscribers are added).

**Tests to Add:**
- `event-bus.test.ts`: no new test required for the "no subscribers" state itself (this is a documentation fix), but add a test confirming the new debug-log subscriber (step 3) receives every emitted event type, as a smoke test that the bus's plumbing is intact end-to-end.

**Risk After Fix:** No functional risk changes — this finding is about correcting the gap between documented and actual architecture, not fixing a live bug. The real risk (H-11) is addressed separately.

---

## H-11 — The event bus is in-memory only and not viable for a horizontally-scaled deployment

**Root Cause:** `event-bus.ts`'s `CommerceEventBus` is backed by a bare Node `EventEmitter` — process-local memory, no persistence, no shared broker.

**Files to Modify:**
- `apps/api/prisma/schema.prisma` — add an `OutboxEvent` model (`id`, `type`, `payload Json`, `createdAt`, `processedAt DateTime?`) as a durable staging table, distinct from the existing `OrderEvent` (which is the domain audit log, not a processing queue).
- `apps/api/src/modules/commerce/events/event-bus.ts` — no removal of the existing in-process `EventEmitter` (it remains useful for same-process, low-latency, non-durability-critical consumers like the H-10 debug logger); this fix adds a durable path alongside it, not a replacement.
- `apps/api/src/modules/commerce/events/record-order-event.ts` — `emitOrderEvent`.
- `apps/api/src/modules/commerce/events/outbox-worker.ts` (**new**) — polls `OutboxEvent` for unprocessed rows and dispatches to durable-path subscribers.

**Exact Implementation Plan:**
1. This is explicitly scoped as infrastructure work, not a feature — its job is to make the *next* durability-sensitive subscriber (fraud detection, loyalty accrual, POS sync — all named in the architecture's own comments as intended future consumers) safe to build, without requiring that subscriber's author to solve this problem themselves.
2. Extend `writeOrderEvent` (already correctly transaction-scoped, writing the durable `OrderEvent` audit row inside the originating `$transaction`) to *also* write an `OutboxEvent` row in the same transaction, for event types that durability-sensitive consumers will care about (start with the full `OrderEventType` set — narrowing later is easy, widening after subscribers exist is not).
3. Build a simple polling worker (`outbox-worker.ts`) that runs on an interval (same single-process `setInterval` approach as C-11's offer-expiry job — consistent with this codebase's current deployment model), selects a batch of unprocessed `OutboxEvent` rows, dispatches each to the in-process `commerceEventBus.emit()` (reusing the existing typed bus as the actual subscriber-facing API — this fix changes *how reliably* an event reaches the bus, not the bus's own public interface), and marks them `processedAt` on success.
4. This design gives once-or-more delivery (a crash between dispatch and marking `processedAt` could redeliver) rather than exactly-once — document this explicitly, and require any real subscriber built on top of it to be idempotent (a reasonable, standard requirement for outbox-pattern consumers, and consistent with this codebase's existing idempotency-key discipline elsewhere).
5. Do not attempt multi-instance coordination (e.g., ensuring only one instance's worker processes a given batch) in this fix if the deployment is still single-instance — note this as the next follow-up the moment horizontal scaling is actually introduced, with a `SELECT ... FOR UPDATE SKIP LOCKED`-style claim mechanism being the natural next step at that point.

**Tests to Add:**
- `record-order-event.test.ts`: `writeOrderEvent` writes both the `OrderEvent` and `OutboxEvent` rows atomically within the same transaction (assert both writes are part of the same `tx` call).
- `outbox-worker.test.ts` (new): processes unprocessed rows in order, marks them `processedAt`, does not reprocess already-processed rows, and correctly dispatches to `commerceEventBus.emit()` with the right event shape.
- `outbox-worker.test.ts`: a dispatch failure (subscriber throws) leaves the row unprocessed for retry on the next poll, rather than marking it processed despite the failure.

**Risk After Fix:** Events are now durably recorded and will survive a process crash between write and dispatch, closing the primary structural risk the audit flagged. Residual risk, explicitly acknowledged: this is still a single-instance-only worker design (no multi-instance claim coordination), and delivery is at-least-once, not exactly-once — both are reasonable, standard tradeoffs for this stage, but must be revisited before real horizontal scaling, and any subscriber built on this must be written idempotently from day one.

---

## H-12 — Notification failures on staff-facing order transitions surface as a 500 after the status has already changed

**Root Cause:** The identical unguarded-await pattern found in checkout (C-15/C-2) exists on every staff-facing order-lifecycle action that sends a notification: `markReady`, `markOutForDelivery`, `completeOrder`, `refundOrder` in `orders.service.ts`.

**Files to Modify:**
- `apps/api/src/modules/commerce/orders/orders.service.ts` — `markReady`, `markOutForDelivery`, `completeOrder`, `refundOrder`.

**Exact Implementation Plan:**
1. Apply the identical pattern established in C-2's fix (catch-and-log notification failures internally, never let them propagate out of the calling function) to each of these four functions, immediately around their respective `sendOrderReadyNotification`/`sendOrderOutForDeliveryNotification`/`sendOrderDeliveredNotification`/`sendRefundIssuedNotification` calls.
2. Since this is the same fix pattern applied to four call sites, consider extracting a small shared helper, e.g. `notifyBestEffort(fn: () => Promise<void>): Promise<void>` that wraps a notification call in a try/catch-and-log, and use it at all five sites total (the four here plus checkout's, from C-2) for consistency — this reduces the chance of the same mistake being reintroduced at a sixth call site in the future.

**Tests to Add:**
- `orders.service.test.ts`: for each of the four functions, a notification-send failure does not cause the function itself to throw, and the underlying state transition (already persisted before the notification call) is unaffected.
- If the shared `notifyBestEffort` helper is extracted: a dedicated unit test for it (catches and logs, never rethrows, regardless of the wrapped function's failure mode).

**Risk After Fix:** Staff no longer see a false-failure 500 for an action that actually succeeded. Residual risk: none beyond the general note (shared with C-2) that a true process crash mid-notification is a different, much rarer failure mode not addressed by this fix (an in-process try/catch cannot protect against the process itself dying).

---

## H-13 — The payment webhook endpoint has no rate limiter

**Root Cause:** `payments.routes.ts`'s `paymentWebhookRouter` (mounted at `/api/webhooks/payments` in `app.ts`) has no rate-limiting middleware, unlike the rest of the public-facing mutating commerce surface.

**Files to Modify:**
- `apps/api/src/middleware/rate-limit.ts` — add `webhookRateLimiter`.
- `apps/api/src/modules/commerce/payments/payments.routes.ts` — apply it to the webhook route.

**Exact Implementation Plan:**
1. Add a new limiter in `rate-limit.ts` following the existing pattern (`windowMs`, `limit`, `standardHeaders`, `legacyHeaders`, `message`), tuned generously — webhook traffic from a real payment provider can legitimately burst (e.g., a batch of events after an outage recovery), so this should be noticeably looser than `checkoutRateLimiter`, keyed by IP (the default) since there's no other caller identity available pre-signature-verification. A reasonable starting point: 100 requests/minute per IP, adjustable based on the specific provider's documented webhook-retry behavior once one is checked.
2. Apply `webhookRateLimiter` to `paymentWebhookRouter`'s route in `payments.routes.ts`.
3. Ensure the limiter runs *before* the expensive work (DB lookup, decryption, signature verification) in the request pipeline — Express middleware ordering already guarantees this as long as the limiter is registered as route middleware ahead of the handler, which is the standard pattern already used elsewhere in this codebase.

**Tests to Add:**
- A lightweight integration-style test (or a code-level check, if full rate-limiter integration testing isn't already a pattern in this codebase — check existing coverage for `checkoutRateLimiter`/`customerAuthRateLimiter` as precedent) confirming the webhook route has the limiter middleware registered.

**Risk After Fix:** Naive flooding of the webhook endpoint is blunted. Residual risk: IP-based rate limiting can still be circumvented by a distributed flood; this is an accepted, standard limitation of IP-keyed rate limiting broadly (see L-6's related note) and is not specific to this endpoint.

---

## H-14 — No rate limiting on any staff-auth-gated commerce router

**Root Cause:** `payments`, `pos`, `coupons`, staff-facing `orders`, `delivery-rules`, `fulfillment`, and `menu-commerce` routers have no rate-limiting middleware at all, unlike `cart`, `checkout`, and the auth routers.

**Files to Modify:**
- `apps/api/src/middleware/rate-limit.ts` — add `staffActionRateLimiter`.
- `apps/api/src/app.ts` — apply it at the router-mount level for the affected routers, or apply it per-router in each router file for consistency with how `checkoutRateLimiter` is applied route-by-route today (prefer per-router application to match existing convention rather than introducing a new global-mount pattern).

**Exact Implementation Plan:**
1. Add `staffActionRateLimiter` in `rate-limit.ts` — looser than the public-facing limiters (staff are authenticated, legitimate usage bursts are more likely — e.g., a busy dashboard session), but present as a defense-in-depth layer against a compromised session. A reasonable starting point: 60 requests/minute per IP+session combination if the rate-limit library supports a compound key, otherwise per-IP as the simplest first pass (check `express-rate-limit`'s `keyGenerator` option, already available given the library is already a dependency).
2. Apply `staffActionRateLimiter` alongside `requireAuth`/`requireRole` on every route in `payments.routes.ts`, `pos.routes.ts`, `coupons.routes.ts`, `orders.routes.ts` (the staff half only — leave `publicOrdersRouter` alone, it's covered by M-12's fix separately), `delivery-rules.routes.ts`, `fulfillment.routes.ts`, and `menu-commerce.routes.ts`.
3. Do this as a single, mechanical pass across all seven route files for consistency — this is a good candidate for one focused PR rather than splitting across the fixes above, since it's the same three-line change (import, add to middleware chain) repeated per route.

**Tests to Add:**
- One test per affected router file (or a shared parametrized test if the test infrastructure supports it) confirming the rate limiter is registered on every route — mirrors H-13's verification approach, applied across all seven routers.

**Risk After Fix:** A compromised or leaked staff session now has a throttle on sensitive actions (refunds, provider connections, POS sync) consistent with the rest of the authenticated surface. Residual risk: same IP-keyed limitations as H-13/L-6 — this is a defense-in-depth layer, not a substitute for session security itself.

---

# Future Improvements

These are the 19 Medium and 10 Low findings from the audit. They are real and worth fixing, but none of them individually blocks a first paying customer the way the Critical/High findings do. Sequencing within this section favors cheap, self-contained wins first.

## M-1 — No encryption key rotation or versioning for BYOP credentials

**Root Cause:** `lib/encryption.ts`'s stored ciphertext format (`iv:authTag:ciphertext`) carries no key-version identifier.

**Files to Modify:** `apps/api/src/lib/encryption.ts`; every caller that decrypts (`orchestrator.ts`, `provider.service.ts`, `fulfillment`/`pos` equivalents).

**Exact Implementation Plan:** Prefix the stored ciphertext with a short key-version marker (e.g., `v1:iv:authTag:ciphertext`). `encryptSecret` always encrypts under the current key version (read from a `COMMERCE_ENCRYPTION_KEY_CURRENT_VERSION` env var, defaulting to `1`); `decryptSecret` reads the version prefix and selects the corresponding key from a small version→key map (`COMMERCE_ENCRYPTION_KEY_V1`, etc.), enabling old ciphertext to remain decryptable after a new key is introduced as the current version for new writes. Add an operational script/endpoint (admin-only) to re-encrypt a provider's credentials under the current key on demand, for gradual migration.

**Tests to Add:** `encryption.test.ts` — round-trips correctly for an unprefixed legacy value (backward compatibility during migration) and for a versioned value; decryption selects the correct key by version; encryption always uses the current version.

**Risk After Fix:** Key rotation becomes operationally possible without a platform-wide credential-reset event. Residual risk: the version→key map itself needs safe operational handling (old keys must remain available as long as any ciphertext under them exists) — this is a process/ops discipline requirement, not something the code alone can enforce.

---

## M-2 — Encrypted credential ciphertext is exposed in API responses

**Root Cause:** `provider.service.ts`'s `listProviders`/`connectProvider` return full Prisma `PaymentProvider` rows with no field selection.

**Files to Modify:** `apps/api/src/modules/commerce/payments/provider.service.ts`, `payments.controller.ts`; apply the identical pattern to `fulfillment/provider.service.ts` and `pos/pos.service.ts` if they have the same gap (check during implementation — the audit's cited example is payments-specific but the pattern likely recurs).

**Exact Implementation Plan:** Define an explicit `select` (or a mapping function `toPublicProvider(provider)`) that includes only `id, providerType, displayName, status, implemented, priority, isDefault, publicKey, connectedAt` and excludes `credentialsEncrypted`/`webhookSecretEncrypted`. Apply it at every point a `PaymentProvider` row is serialized to an API response.

**Tests to Add:** `provider.service.test.ts` — `listProviders`/`connectProvider`'s return shape never includes the two excluded fields (explicit `expect(...).not.toHaveProperty(...)` assertions, not just spot-checking present fields).

**Risk After Fix:** Ciphertext no longer travels over the wire unnecessarily. Residual risk: none — this is a pure exposure-reduction fix with no functional tradeoff.

---

## M-3 — Cumulative partial refunds never flip `Order.status` to `REFUNDED`

**Root Cause:** `orders.service.ts`'s `refundOrder` computes `isFullRefund = input.amountCents >= order.totalCents`, comparing only the *current* request against the total, ignoring prior refunds.

**Files to Modify:** `apps/api/src/modules/commerce/orders/orders.service.ts` — `refundOrder`.

**Exact Implementation Plan:** After `refundOrderPayment` succeeds, read the updated `Payment.refundedAmountCents` (now authoritative post-C-7's fix) rather than recomputing from the single request amount, and compute `isFullRefund = payment.refundedAmountCents >= payment.capturedAmountCents` using that cumulative figure.

**Tests to Add:** `orders.service.test.ts` — two sequential partial refunds that together equal the order total result in `Order.status: "REFUNDED"` after the second call, not stuck at the prior status.

**Risk After Fix:** Order status and payment status stay consistent through any sequence of partial refunds. Residual risk: none.

---

## M-4 — Refunding a cash order produces a raw 500 instead of a clean 4xx

**Root Cause:** `orders.service.ts`'s `refundOrder` throws a raw `Error` when `!order.payment`; `orders.controller.ts`'s catch chain doesn't recognize it.

**Files to Modify:** `apps/api/src/modules/commerce/orders/orders.service.ts`, `orders.controller.ts`, `payments/payments.errors.ts` (activate the existing `PaymentNotFoundError`).

**Exact Implementation Plan:** Replace the raw `throw new Error(...)` with `throw new PaymentNotFoundError()`; add it to `refundHandler`'s catch chain mapping to `422` ("this order has no captured payment to refund").

**Tests to Add:** `orders.service.test.ts` — refunding a cash order throws `PaymentNotFoundError` specifically; `orders.controller.test.ts` — maps to 422 with a clear message.

**Risk After Fix:** A routine staff action gets a clean, actionable response. Residual risk: none.

---

## M-5 — `nextOrderNumber` race produces an unhandled 500 under concurrent checkout

**Root Cause:** `order-number.ts`'s `nextOrderNumber` reads-then-creates with no retry on the resulting `@@unique([restaurantId, orderNumber])` constraint violation.

**Files to Modify:** `apps/api/src/modules/commerce/checkout/checkout.service.ts` (the transaction wrapping order creation).

**Exact Implementation Plan:** Wrap the `$transaction` call in `placeOrder` with a small bounded retry loop (e.g., up to 3 attempts) that specifically catches a `P2002` on `Order`'s `[restaurantId, orderNumber]` constraint and retries the whole transaction (which will call `nextOrderNumber` fresh and get a new number) rather than letting it propagate. Any other error still propagates immediately, unretried.

**Tests to Add:** `checkout.service.test.ts` — a `P2002` on order-number uniqueness on the first attempt succeeds on retry; a non-constraint error is not retried and propagates immediately; exhausting all retries (mock 3 consecutive `P2002`s) surfaces a clear error rather than looping forever.

**Risk After Fix:** Rush-hour order-number contention self-heals via retry instead of surfacing a raw 500. Residual risk: an extremely hot restaurant could theoretically exhaust the retry budget; the fixed retry cap turns that into a rare, clear failure rather than an infinite loop.

---

## M-6 — `getOrCreateActiveCart` check-then-create race produces duplicate active carts

**Root Cause:** No unique constraint on `Cart(restaurantId, customerId/guestSessionId, status=ACTIVE)`; `getOrCreateActiveCart` is a plain check-then-create.

**Files to Modify:** `apps/api/prisma/schema.prisma`, `apps/api/src/modules/commerce/cart/cart.service.ts`.

**Exact Implementation Plan:** Add a partial unique index (Postgres supports partial indexes; Prisma exposes this via a raw SQL migration since the schema DSL itself doesn't have first-class partial-unique-index syntax) on `Cart(restaurantId, customerId)` WHERE `status = 'ACTIVE'` and a second one on `Cart(restaurantId, guestSessionId)` WHERE `status = 'ACTIVE'`. In `getOrCreateActiveCart`, catch the resulting `P2002` on `create()` and re-fetch the now-existing row instead of treating it as an error.

**Tests to Add:** `cart.service.test.ts` — a `P2002` on the create call is caught and the existing row is re-fetched and returned rather than the error propagating.

**Risk After Fix:** Duplicate active carts for the same identity become impossible at the database level. Residual risk: none — this is a straightforward constraint-plus-catch pattern already proven elsewhere in this codebase (`Order.cartId`, coupon codes).

---

## M-7 — No guest-cart-to-customer merge on login

**Root Cause:** No code path re-parents a guest-session cart to a customer identity at login/registration.

**Files to Modify:** `apps/api/src/modules/commerce/customers/customers.service.ts` (or `customers.controller.ts`'s `loginHandler`/`registerHandler`), `apps/api/src/modules/commerce/cart/cart.service.ts`.

**Exact Implementation Plan:** Add `mergeGuestCartIntoCustomer(guestSessionId, customerId, restaurantId)` to `cart.service.ts` — finds an `ACTIVE` cart matching the guest session for the restaurant in question and updates it to `customerId`, clearing `guestSessionId`. Call this from `loginHandler`/`registerHandler` when a `guest_session_id` cookie is present on the request, scoped to whichever restaurant the login/registration happened in context of (this requires the frontend to pass the current restaurant context on login when initiated from a checkout flow — coordinate with the frontend change needed).

**Tests to Add:** `cart.service.test.ts` — merging re-parents the cart correctly and does not create a duplicate; merging when no guest cart exists is a no-op, not an error.

**Risk After Fix:** A guest's in-progress cart survives login. Residual risk: this only handles the single-restaurant checkout-triggered login case cleanly; a customer logging in from a context with no specific restaurant (e.g., the general account page) has no cart to merge by definition, which is expected.

---

## M-8 — No cart expiry/cleanup job; `expiresAt` is written and never enforced

**Root Cause:** `Cart.expiresAt` is set at creation and never read back by any query or job.

**Files to Modify:** `apps/api/src/modules/commerce/cart/cart.service.ts`.

**Exact Implementation Plan:** Add `expiresAt: { gt: new Date() }` to `getOrCreateActiveCart`'s existing `findFirst` filter (so an expired cart is treated as if it doesn't exist, triggering fresh-cart creation instead of reuse). Add a periodic sweep (same `setInterval` pattern as C-11/H-11's workers) that transitions `ACTIVE` carts past `expiresAt` to `EXPIRED` for housekeeping/reporting purposes (not required for correctness once the query-level filter above is in place, but keeps the `Cart` table's `status` column meaningful for analytics).

**Tests to Add:** `cart.service.test.ts` — `getOrCreateActiveCart` ignores an expired `ACTIVE` cart and creates a fresh one; the sweep job correctly transitions expired carts.

**Risk After Fix:** Stale carts stop being silently reused. Residual risk: none.

---

## M-9 — Tracked inventory (`quantityAvailable`) is never decremented on order placement

**Root Cause:** `isItemOrderable` reads `quantityAvailable` for eligibility but nothing decrements it at order placement.

**Files to Modify:** `apps/api/src/modules/commerce/checkout/checkout.service.ts` (inside `placeOrder`'s `$transaction`), `apps/api/src/modules/commerce/menu-commerce/inventory.service.ts`.

**Exact Implementation Plan:** Inside the same transaction that creates `OrderItem` rows, for each item whose `MenuItemInventory.trackInventory` is `true`, atomically decrement `quantityAvailable` with a floor check: `tx.menuItemInventory.updateMany({ where: { menuItemId, quantityAvailable: { gte: item.quantity } }, data: { quantityAvailable: { decrement: item.quantity } } })`, and verify the `count` of the update result is `1` — if `0`, the stock ran out between the eligibility check and this point, and the transaction should abort with `ItemUnavailableAtCheckoutError` for that item (this is the same TOCTOU-closing pattern as the coupon fix in C-8, applied to inventory).

**Tests to Add:** `checkout.service.test.ts` — a tracked item with sufficient stock decrements correctly; a tracked item whose stock was exhausted by a "concurrent" order (simulated via the updateMany returning `count: 0`) aborts the checkout with a clear error rather than overselling.

**Risk After Fix:** Tracked inventory becomes a real oversell guard rather than informational-only. Residual risk: none — this closes the gap directly using the same transactional pattern already proven in this codebase.

---

## M-10 — No guest-order-to-customer-account linking

**Root Cause:** No code searches `GuestCustomer` by email at registration/login.

**Files to Modify:** `apps/api/src/modules/commerce/customers/customers.service.ts`.

**Exact Implementation Plan:** Largely subsumed by H-5's fix, which already introduces email-keyed `GuestCustomer` reuse across guest orders. Extend that further: on `registerCustomer`, after creating the `Customer` row, query `GuestCustomer` rows matching the registered email and — rather than merging identities (which would require moving `Order.guestCustomerId` references, a more invasive change) — add a `Customer.email`-matched lookup path to the customer's order-history endpoint that additionally surfaces prior guest orders sharing the same verified email, presented as "orders placed before you created an account."

**Tests to Add:** `customers.service.test.ts` — order history correctly includes matching prior guest orders by email after registration.

**Risk After Fix:** Returning customers see continuity in their order history. Residual risk: this is an email-match, not a cryptographically verified link — acceptable here since it's read-only history surfacing, not an authorization decision.

---

## M-11 — `createFavorite` doesn't validate that the menu item belongs to the given restaurant

**Root Cause:** `favorites.service.ts`'s `createFavorite` accepts `restaurantId`/`menuItemId` with no cross-check.

**Files to Modify:** `apps/api/src/modules/commerce/customers/favorites.service.ts`.

**Exact Implementation Plan:** Before creating the `CustomerFavorite` row, fetch the `MenuItem` by `menuItemId` and verify `menuItem.restaurantId === restaurantId`; throw a new `MenuItemRestaurantMismatchError` (or reuse an existing not-found-shaped error, consistent with this codebase's tenant-isolation convention) if not.

**Tests to Add:** `favorites.service.test.ts` — creating a favorite with a mismatched `restaurantId`/`menuItemId` pair is rejected.

**Risk After Fix:** Favorites data stays internally consistent. Residual risk: none.

---

## M-12 — Public order-tracking endpoint over-shares and has no rate limiter

**Root Cause:** `orders.controller.ts`'s `prismaFindPublicOrder` does an unfiltered `findUnique` and serializes the full row; `publicOrdersRouter` has no rate limiter.

**Files to Modify:** `apps/api/src/modules/commerce/orders/orders.controller.ts`, `orders.routes.ts`.

**Exact Implementation Plan:** Define an explicit public projection (`orderNumber, status, paymentStatus, fulfillmentType, subtotalCents, taxCents, tipCents, deliveryFeeCents, serviceFeeCents, discountCents, totalCents, placedAt, items: { menuItemNameSnapshot, quantity, unitPriceCents }`) excluding `notes`, `deliveryInstructions`, `cartId`, `customerId`/`guestCustomerId`, and any other internal field. Apply `publicCommerceRateLimiter` (already exists, used elsewhere for public reads) to `publicOrdersRouter`.

**Tests to Add:** `orders.controller.test.ts` — the public order response excludes the internal fields explicitly (assert `.not.toHaveProperty(...)` for each); rate limiter registration check consistent with H-13/H-14's approach.

**Risk After Fix:** Reduces the blast radius of a leaked order ID considerably, and adds throttling. Residual risk: possession-of-UUID remains the access model for this endpoint by design (implementing the originally-intended order-number-plus-contact-verification scheme is a larger product change, out of scope for this incremental fix).

---

## M-13 — Kitchen capacity's concurrent-order check is a check-then-act race

**Root Cause:** `quote.service.ts` reads the active-order count outside any transaction/lock, before `placeOrder`'s order-creation transaction runs.

**Files to Modify:** `apps/api/src/modules/commerce/checkout/checkout.service.ts`, `apps/api/src/modules/commerce/delivery-rules/kitchen-capacity.service.ts`.

**Exact Implementation Plan:** Since the eligibility check (`computeCheckoutQuote`) necessarily runs before the order-creation transaction (the quote is needed to know the order's amounts before creating it), close this race the same way as M-9/C-8: re-check kitchen capacity **inside** `placeOrder`'s `$transaction`, immediately before `tx.order.create`, using a fresh `tx.order.count(...)` against the same active-status set `isKitchenAvailable` uses — if capacity is now exceeded (a concurrent order landed between the quote and this point), abort the transaction with `CheckoutIneligibleError("Kitchen is at capacity, please try again shortly")`.

**Tests to Add:** `checkout.service.test.ts` — a capacity check that passes at quote time but fails at the in-transaction re-check aborts order creation with a clear error.

**Risk After Fix:** The cap becomes a real guarantee under concurrency, matching the coupon (C-8) and inventory (M-9) fixes' pattern. Residual risk: none beyond the same customer-facing "please try again" UX tradeoff already accepted for C-8.

---

## M-14 — Driver location staleness is never checked anywhere

**Root Cause:** `currentLat`/`currentLng`/`lastLocationAt` are written but never read back with a staleness check anywhere downstream.

**Files to Modify:** Wherever driver location is first surfaced to staff/customers (not yet built as of this audit) — this fix's scope is to establish the convention now so it's applied correctly the first time it's needed, rather than to build a new UI surface.

**Exact Implementation Plan:** Add a small pure helper, `isLocationStale(lastLocationAt: Date | null, thresholdMs = 2 * 60_000): boolean`, in `fulfillment.service.ts` or a shared location-utils module. Document in the `DriverAssignment` schema comment that any future consumer of `currentLat`/`currentLng` must gate display on this check. If/when a driver-tracking map view is built (not currently in scope), it must call this helper and show an explicit "location may be out of date" state rather than presenting a stale position as current.

**Tests to Add:** `isLocationStale` — a small pure-function unit test covering the boundary (exactly at threshold, just under, just over, and `null` input treated as maximally stale).

**Risk After Fix:** Establishes the correct pattern ahead of the feature that will need it. Residual risk: this fix alone has no user-visible effect until a location-display feature actually consumes the helper — tracked here so that feature isn't built without it.

---

## M-15 — Active-driver-assignment count on the checkout hot path has no restaurant-scoped index

**Root Cause:** `countActiveDriverAssignments` joins `DriverAssignment` to `Fulfillment` to filter by `restaurantId`, with no index on `DriverAssignment` supporting that join efficiently.

**Files to Modify:** `apps/api/prisma/schema.prisma` — `DriverAssignment`.

**Exact Implementation Plan:** Add a denormalized `restaurantId String` column directly on `DriverAssignment` (populated at assignment-creation time from `fulfillment.restaurantId`, which `assignDriver` already has in scope), with a new `@@index([restaurantId, status])`. Update `countActiveDriverAssignments` to filter directly on `DriverAssignment.restaurantId` instead of joining through `Fulfillment`.

**Tests to Add:** `fulfillment.service.test.ts` — `assignDriver` populates the new `restaurantId` column correctly; `countActiveDriverAssignments` still returns correct counts after the query rewrite (existing tests should catch a behavioral regression here without new tests, but add one exercising a restaurant with assignments belonging to a *different* restaurant present in the table, to confirm the scoping is still correct post-denormalization).

**Risk After Fix:** The hottest query in the checkout path gets a proper index. Residual risk: denormalization introduces a small consistency-maintenance burden (the copied `restaurantId` must never drift from `Fulfillment.restaurantId`) — acceptable here since it's set once at creation and `Fulfillment.restaurantId` is itself immutable in practice.

---

## M-16 — Restaurant open/closed evaluation uses the server's timezone, not the restaurant's

**Root Cause:** `hours.service.ts`'s `isRestaurantOpenAt` evaluates `Date` methods that resolve in the server process's local timezone; `Restaurant` has no `timezone` field.

**Files to Modify:** `apps/api/prisma/schema.prisma` — `Restaurant.timezone`; `apps/api/src/modules/commerce/delivery-rules/hours.service.ts`; `apps/api/package.json` (a small timezone-aware date library, e.g. `date-fns-tz` or the platform `Intl` API, if not already available).

**Exact Implementation Plan:** Add `Restaurant.timezone String @default("America/New_York")` (or another sensible default, but never leave it implicitly server-local) via migration; expose it in the restaurant settings form for owners to set correctly. Rewrite `isRestaurantOpenAt` to convert the evaluation instant into the restaurant's configured timezone (via `Intl.DateTimeFormat` with the `timeZone` option, or a small library) before extracting hour/minute/day-of-week, rather than using the server process's local `Date` accessors directly.

**Tests to Add:** `hours.service.test.ts` — a restaurant configured for a timezone different from the test-runner's local/UTC timezone correctly evaluates open/closed at a time that would give the *opposite* answer if evaluated in the wrong timezone (this is the specific regression case that proves the fix, not just "some timezone works").

**Risk After Fix:** Hours evaluation becomes correct regardless of server deployment region. Residual risk: existing restaurants will have the default timezone until an owner corrects it — worth a one-time data-quality pass/prompt at rollout to have existing restaurants confirm their timezone.

---

## M-17 — No CSRF token mechanism

**Root Cause:** No CSRF protection exists anywhere; the sole mitigation is `SameSite=lax` on all cookies.

**Files to Modify:** `apps/api/src/app.ts`, `apps/api/src/middleware/` (new `csrf.ts`), the checkout/refund/payment-provider-management route files, `apps/web/src/lib/*-api.ts` (to attach the token).

**Exact Implementation Plan:** Implement a double-submit-cookie CSRF token: on session establishment (login, or first guest-cart creation), set a non-httpOnly `csrf_token` cookie with a random value; require every state-changing request on the highest-value endpoints (checkout `place-order`, refund, payment-provider connect/disconnect/priority) to include the same value in an `X-CSRF-Token` header, verified server-side by simple equality against the cookie. Add the check as middleware applied specifically to those routes rather than globally, to avoid unnecessary blast radius on this initial pass.

**Tests to Add:** New `csrf.test.ts` middleware unit test — request with matching cookie/header passes; missing or mismatched header is rejected with `403`. Controller-level tests for the three route groups confirming the middleware is wired in.

**Risk After Fix:** A second layer of defense exists for the highest-value state-changing endpoints beyond `SameSite=lax`. Residual risk: double-submit-cookie CSRF is a well-understood, standard pattern but is not applied platform-wide in this initial pass — scoped deliberately to the highest-value endpoints first; broadening coverage is a reasonable low-risk follow-up.

---

## M-18 — Missing compound index for combined order-status-and-source filtering

**Root Cause:** `Order` has separate `[restaurantId,status]` and `[restaurantId,source]` indexes, no compound covering both.

**Files to Modify:** `apps/api/prisma/schema.prisma` — `Order`.

**Exact Implementation Plan:** Add `@@index([restaurantId, status, source])` if/when the owner dashboard's order-list filtering by both dimensions simultaneously becomes a common query pattern — confirm via the dashboard's actual query patterns (`orders.service.ts`'s `listOrders`) before adding, since this is explicitly a "monitor, don't pre-emptively fix" item per the audit.

**Tests to Add:** None required unless/until the index is added; if added, no behavioral test is needed (indexes don't change query results, only performance) — a `prisma validate`/migration-applies-cleanly check is sufficient.

**Risk After Fix:** N/A until implemented. Residual risk: none — purely additive, no behavioral change.

---

## M-19 — Currency is hardcoded to `"usd"` throughout the payment path

**Root Cause:** `checkout.service.ts` hardcodes `currency: "usd"` when calling `authorizeOrderPayment`.

**Files to Modify:** Deferred — no immediate action recommended unless multi-currency support becomes a real product requirement.

**Exact Implementation Plan:** If/when needed: add `Restaurant.currency String @default("usd")`, thread it through `computeCheckoutQuote`/`placeOrder` in place of the hardcoded literal, and audit every `amountCents`-handling function (fee rules, tax, orchestrator) for any USD-specific assumption (e.g., minor-unit precision — most currencies use 2 decimal places like USD, but not all; JPY, for example, has none) before enabling a non-USD restaurant.

**Tests to Add:** Deferred until implementation is scheduled.

**Risk After Fix:** N/A. Residual risk: this is correctly scoped as a documented limitation, not a defect, for a US-only launch — revisit only when multi-currency is an actual requirement.

---

## L-2 — Webhook `:providerType` path segment is captured but never checked

**Root Cause:** `webhook.controller.ts` captures `req.params.providerType` and never reads or validates it against the resolved provider.

**Files to Modify:** `apps/api/src/modules/commerce/payments/webhook.controller.ts`.

**Exact Implementation Plan:** After resolving the `PaymentProvider` via `providerId`, add an explicit check: `if (provider.providerType.toLowerCase() !== req.params.providerType) throw new InvalidWebhookRequestError()` (new, small typed error), mapped to `400`. This makes the path segment a genuine cross-check rather than dead routing, and catches a misconfigured webhook URL early and loudly instead of silently working anyway.

**Tests to Add:** `webhook.controller.test.ts` — a mismatched `providerType` path segment vs. the resolved provider's actual type is rejected.

**Risk After Fix:** Closes a misleading-but-currently-harmless gap; makes a future misconfiguration fail loudly instead of silently succeeding via `providerId` alone. Residual risk: none.

---

## L-3 — Webhook signature-header selection is hardcoded outside the adapter interface

**Root Cause:** `webhook.controller.ts` hardcodes `req.header("stripe-signature") ?? req.header("x-webhook-signature")` rather than delegating to the per-provider adapter.

**Files to Modify:** `apps/api/src/modules/commerce/payments/types.ts` (`PaymentProviderAdapter` interface), `stripe.provider.ts` and the five stub providers, `webhook.controller.ts`.

**Exact Implementation Plan:** Add `readonly signatureHeaderName: string` to the `PaymentProviderAdapter` interface (Stripe: `"stripe-signature"`; stubs can use a placeholder value since they're unreachable via `implemented: false`). In `webhook.controller.ts`, resolve the header name from the adapter once the provider is known, rather than a hardcoded `??` chain.

**Tests to Add:** `stripe.provider.test.ts` — asserts the correct `signatureHeaderName`; `webhook.controller.test.ts` — the controller reads the header the resolved adapter specifies.

**Risk After Fix:** The next real provider integration is a pure adapter addition, no shared-controller edits needed — consistent with the rest of the registry pattern. Residual risk: none.

---

## L-4 — Stuck `PENDING_PAYMENT` orders have no automated recovery

**Root Cause:** A process crash between order creation and payment resolution leaves an order permanently `PENDING_PAYMENT` with no timeout mechanism.

**Files to Modify:** `apps/api/src/modules/commerce/orders/orders.service.ts` (new `expireStalePendingOrders`), same worker-scheduling approach as C-11/H-11.

**Exact Implementation Plan:** Add a periodic sweep (reuse the same `setInterval`-based worker pattern established for C-11) that finds `Order` rows with `status: "PENDING_PAYMENT"` older than a generous threshold (e.g., 15 minutes — comfortably longer than any legitimate in-flight checkout, including the C-6 3DS-confirmation window) and transitions them to `FAILED` via the existing state machine, writing an `OrderEvent` explaining the automated timeout.

**Tests to Add:** `orders.service.test.ts` — `expireStalePendingOrders` transitions only sufficiently-old `PENDING_PAYMENT` orders, leaves recent ones untouched.

**Risk After Fix:** No order can be silently stuck forever. Residual risk: the threshold must be tuned generously enough not to race with the C-6 3DS flow's legitimate multi-step timing — coordinate the two thresholds when both are implemented.

---

## L-5 — Cart item quantity has no upper bound

**Root Cause:** `cart.validation.ts`'s `addCartItemSchema`/`updateCartItemSchema` don't cap `quantity`.

**Files to Modify:** `apps/api/src/modules/commerce/cart/cart.validation.ts`.

**Exact Implementation Plan:** Add `.max(99)` to both schemas' `quantity` field.

**Tests to Add:** `cart.controller.test.ts` — a quantity above the cap is rejected with a 400.

**Risk After Fix:** Closes a minor abuse/UX gap. Residual risk: none — pick a cap generous enough not to affect any legitimate catering-scale order; confirm 99 is sufficient or adjust based on product input.

---

## L-6 — Auth rate limiting is IP-keyed only, with no per-account lockout

**Root Cause:** `customerAuthRateLimiter` throttles by IP only.

**Files to Modify:** `apps/api/src/middleware/rate-limit.ts`, `apps/api/src/modules/commerce/customers/customers.service.ts`.

**Exact Implementation Plan:** Not urgent given argon2id hashing is already a reasonable mitigation (per the audit's own severity note). If prioritized: add a per-account failed-attempt counter (e.g., a `failedLoginAttempts`/`lockedUntil` pair on `Customer`, incremented on failed `validateCustomerCredentials` calls, reset on success), locking the account for a short window after a threshold (e.g., 10 failures / 15-minute lock) independent of the caller's IP.

**Tests to Add:** `customers.service.test.ts` — repeated failed logins lock the account; a successful login resets the counter; a locked account rejects even a correct password until the lock expires.

**Risk After Fix:** Defense-in-depth against distributed credential stuffing. Residual risk: account lockout itself can be abused as a denial-of-service vector against a specific victim's account (an attacker deliberately fails login attempts to lock out the real owner) — mitigate by making the lockout a rate-limiting delay rather than a hard lock, or by not blocking password-reset access during a lockout.

---

## L-7 — Loyalty and gift-card models are confirmed fully unreferenced (informational)

**Root Cause:** N/A — this is confirmed-correct, intentional scope, not a defect.

**Files to Modify:** None.

**Exact Implementation Plan:** No action required. Recorded here only so this remediation plan's coverage of the audit is complete.

**Tests to Add:** None.

**Risk After Fix:** N/A — working as designed.

---

## L-8 — Several frontend mutation handlers fail silently with no error feedback

**Root Cause:** `cart/page.tsx`'s `handleQuantityChange`/`handleFulfillmentChange`/`handleRemoveCoupon` and `account/page.tsx`'s `handleDeleteAddress`/`handleDeleteFavorite` have no try/catch, unlike sibling handlers in the same files.

**Files to Modify:** `apps/web/src/app/order/[restaurantId]/cart/page.tsx`, `apps/web/src/app/account/page.tsx`.

**Exact Implementation Plan:** Wrap each identified handler's body in the same try/catch-and-`setError` pattern already used correctly by `handleApplyCoupon`/`handleAddAddress` in the same files — this is a direct, mechanical consistency fix, not a new pattern.

**Tests to Add:** Once the frontend test runner exists (introduced as part of C-1's fix), add a component test per handler confirming a rejected API call sets a visible error state rather than failing silently.

**Risk After Fix:** Consistent, visible error feedback across all cart/account mutation actions. Residual risk: none.

---

## L-9 — No dashboard-level auth guard or redirect-on-401

**Root Cause:** No shared layout-level auth check exists for `apps/web/src/app/dashboard/**`; individual pages show a generic error on a failed fetch rather than redirecting to login.

**Files to Modify:** `apps/web/src/app/dashboard/layout.tsx` (**new**, if one doesn't already exist — verify at implementation time), or a shared hook `useRequireStaffAuth()` used by each dashboard page.

**Exact Implementation Plan:** Add a dashboard-scoped layout (Next.js App Router layout file) that performs the same auth check `apps/web/src/app/account/page.tsx` already does correctly (fetch current-session info, `router.replace('/login')` on a 401), applied once at the layout level so every nested dashboard page inherits it rather than needing its own copy.

**Tests to Add:** Once the frontend test runner exists, a layout-level test confirming an unauthenticated/expired session redirects to `/login` rather than rendering the dashboard shell with per-page error messages.

**Risk After Fix:** Consistent, correct UX for an expired staff session across the entire dashboard. Residual risk: none — this is a UX fix; the API remains the actual enforcement boundary regardless.

---

## L-10 — Dead typed errors (`PaymentNotFoundError`, `CheckoutInProgressError`) are defined and never used

**Root Cause:** Both classes exist in their module's `errors.ts` and are never thrown or caught.

**Files to Modify:** `apps/api/src/modules/commerce/payments/payments.errors.ts`, `apps/api/src/modules/commerce/checkout/checkout.errors.ts`.

**Exact Implementation Plan:** `PaymentNotFoundError` is activated as part of M-4's fix (refunding a cash order) — no separate action needed beyond that. `CheckoutInProgressError` — confirm whether C-5's fix (cart-status guard) or the existing idempotency `in_progress` response already fully covers its intended case; if so, remove the now-confirmed-dead class rather than leaving it unused, since keeping unused error types around is exactly the kind of debt this finding flags. Make this determination during C-5's implementation, not as a separate pass.

**Tests to Add:** None beyond what M-4/C-5 already cover, unless the removal itself needs a "this type is no longer exported" check (not typically worth a dedicated test).

**Risk After Fix:** Removes misleading dead code. Residual risk: none.

---

## L-11 — Saved customer payment methods are never used at checkout

**Root Cause:** `CustomerPaymentMethod.providerToken` has full CRUD but is never read by `checkout.service.ts`/`orchestrator.ts`.

**Files to Modify:** `apps/web/src/app/order/[restaurantId]/checkout/page.tsx` (once C-1's tokenization UI exists), `apps/api/src/modules/commerce/checkout/checkout.validation.ts` (accept a `savedPaymentMethodId` alternative to a fresh `methodToken`), `apps/api/src/modules/commerce/checkout/checkout.service.ts`.

**Exact Implementation Plan:** Sequence this after C-1. Extend `placeOrderSchema` to accept an optional `savedPaymentMethodId` alongside `methodToken`; in `placeOrder`, if `savedPaymentMethodId` is present, look up the `CustomerPaymentMethod` (scoped to the authenticated customer — reuse the C-14 ownership-check discipline here too), verify it belongs to a still-`CONNECTED` provider, and use its `providerToken` as the `methodToken` passed to `authorizeOrderPayment`. On the frontend, once C-1's `CardPaymentForm` exists, add a "saved cards" selector shown only to logged-in customers with existing `CustomerPaymentMethod` rows, bypassing the Elements form entirely when a saved method is chosen.

**Tests to Add:** `checkout.service.test.ts` — `placeOrder` correctly resolves and uses a saved payment method's token; rejects a `savedPaymentMethodId` that doesn't belong to the calling customer (ownership check, same discipline as C-14) or whose provider is no longer connected.

**Risk After Fix:** Saved cards become genuinely usable, completing the feature's data model. Residual risk: none beyond the standard care needed anywhere a stored token is used — already covered by the existing BYOP encryption/ownership discipline.

---

# Rollout Summary

**Sprint 07.6 (Critical, 15 findings)** is the mandatory gate before any real paid order should be processed. Follow the Sequencing Note at the top of this document for landing order — it is not arbitrary; several fixes share code regions and landing them out of order will produce avoidable merge conflicts and rework. C-1 (payment tokenization) and the orchestrator-hardening cluster (C-3/C-4/C-7) are the two highest-value, most time-consuming pieces and should be started first given their lead time; the driver-dispatch cluster (C-9/C-10/C-11) and C-12/C-13/C-14 are independent and safe to parallelize alongside them.

**Sprint 07.7 (High, 13 findings)** should follow immediately after 07.6 closes, not in parallel with it — several High fixes (H-8, H-12) explicitly depend on infrastructure introduced in Critical fixes (C-10, C-2 respectively), and H-6/H-7 (customer account security) are sequenced against each other as noted in their own entries.

**Future Improvements (29 findings)** are correctly deferred, but several are genuinely cheap and worth pulling forward opportunistically: M-2 (stop returning ciphertext), M-4/L-10 (dead-error cleanup), M-18 (index), and L-5 (quantity cap) are all small, isolated, low-risk changes that could reasonably ride along with any of the Critical/High work touching the same files, rather than waiting for a dedicated pass.

No code was written in the course of producing this document. This is a specification for review and prioritization, not a diff.
