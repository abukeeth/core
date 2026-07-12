# Sprint 07.7 — High Priority Remediation Final Report

**Scope:** Fix all remaining 13 High findings (H-2 through H-14) from `SPRINT_07_6_REMEDIATION_PLAN.md`'s "Sprint 07.7 — High Priority Fixes" section. No new features. No architecture changes beyond what each fix required. Backward compatibility preserved. All existing tests kept passing. Sprint 07.8 not started.

**Branch:** `claude/sprint-07-commerce-engine`

---

## 1. Findings Fixed (13 / 13 High)

| ID | Finding | Fix summary |
|----|---------|-------------|
| **H-2** | `markPaidCash` had no idempotency guard — a double-submitted staff click (or an idempotency-key retry) could write a second `CHARGE` `Transaction` row for the same cash order | `markPaidCash` is now a no-op once `paymentStatus === "PAID"`; the route was also wrapped in `requireIdempotencyKey` + the reserve/complete/fail idempotency-key pattern already used by `place-order`. |
| **H-3** | Raw payment-provider decline/error text was forwarded verbatim to the unauthenticated checkout client — a card-testing oracle | `PaymentFailedError` now carries a `publicMessage` drawn from a small fixed allowlist keyed by a `PaymentFailureCategory` (`declined_or_unavailable`, `invalid_method`, `method_token_required`, `generic`); the raw provider detail stays in `.message` for server logs only. `checkout.controller.ts` serializes `.publicMessage`, never `.message`. |
| **H-4** | `refundOrder` had no idempotency guard and no check that a refund couldn't exceed the remaining captured balance | Wrapped `refundHandler` in the same reserve/complete/fail idempotency-key pattern as H-2; `refundOrderPayment` now throws the previously-scaffolded-but-unused `RefundExceedsRemainingBalanceError` when `amountCents > capturedAmountCents - refundedAmountCents`, mapped to `422`. |
| **H-5** | Guest checkout's per-customer coupon redemption cap silently never applied — each guest checkout created a brand-new `GuestCustomer` row, so the count-by-identity check always saw zero prior redemptions | `placeOrder` now looks up an existing `GuestCustomer` by email (pre-transaction for the UX check, and again inside the transaction via find-or-create) and reuses its id; `validateCouponForRedemption`'s per-customer check now also runs for a resolved `guestCustomerId`, mirroring the existing `customerId` branch. Documented as an email-keyed limit (not identity-verified), consistent with `GuestCustomer` having no verification step. |
| **H-6** | No password reset or change-password mechanism existed for customer accounts | Added `CustomerPasswordResetToken` (opaque, hashed, single-use, 1-hour expiry) plus three new endpoints: `POST /password-reset/request` (always 200, enumeration-safe), `POST /password-reset/confirm`, and `POST /change-password` (authenticated). Both reset and change invalidate every existing refresh-token session via H-7's `revokeAllCustomerRefreshTokens`. Reset-request is rate-limited with the existing `customerAuthRateLimiter`. |
| **H-7** | Customer refresh tokens were self-contained 30-day JWTs with no server-side revocation; logout only cleared cookies | Replaced with the staff-auth pattern: a new `CustomerRefreshToken` table stores only a token's hash; `refreshHandler` now rotates the presented token (revokes the old row, issues a new pair) with theft-response semantics (a reused/already-revoked token revokes every session for that customer); `logoutHandler` now actually revokes the presented token, not just clears cookies. |
| **H-8** | Reassigning a delivery to a different driver silently overwrote the same `DriverAssignment` row — the original driver was never told the job vanished | `assignDriver` now looks up any existing non-terminal assignment for the fulfillment before the upsert; if it belongs to a different, still-active driver, a new `sendDriverReassignedAwayNotification` (SMS) fires for the previous driver alongside the existing new-offer notification, both best-effort (never blocks the assignment). |
| **H-9** | `resolveRuleChain`'s fallback-following didn't re-check whether the fallback rule was itself `RESTAURANT_DRIVER` and also over the concurrency limit; `validateFallback` never rejected a self-referencing or cyclic `fallbackToRuleId` | Added a bounded (5-hop) `resolveFallback` helper that re-applies the busy check at every hop, continuing past a busy fallback instead of selecting it. `validateFallback` now rejects `fallbackToRuleId === id` (self-reference) and walks the new fallback's own chain (bounded to the same 5 hops) to reject a would-be multi-hop cycle, on both `createRule` and `updateRule`. |
| **H-10** | `commerceEventBus` had zero production subscribers — every `emitOrderEvent()` call was emitted into a bus nobody listened to, with no documentation of that gap | Added an explicit code comment on `event-bus.ts` stating the bus's current subscriber count and the H-11 dependency any future real subscriber must resolve first; added one minimal debug-log subscriber (registered once at module load) purely for observability, so a running environment can confirm the bus is actually receiving what its callers believe it is. |
| **H-11** | The event bus was in-memory only (`EventEmitter`) — not durable, not viable once a subscriber needs to survive a process crash or run across instances | Added an `OutboxEvent` staging table; `writeOrderEvent` now writes an `OutboxEvent` row in the same transaction as its existing `OrderEvent` audit-log write. A new `outbox-worker.ts` (`processOutboxBatch`) polls unprocessed rows, dispatches each to `commerceEventBus.emit()`, and marks it `processedAt` on success (leaving it for retry on failure — at-least-once, not exactly-once, matching the codebase's existing idempotency-key discipline elsewhere). A new `outbox-scheduler.ts` mirrors C-11's `stale-offer-scheduler.ts` interval pattern, started from `index.ts` only. |
| **H-12** | The unguarded-notification-await pattern fixed for checkout in Sprint 07.6 (C-2/C-15) was still present on every staff-facing order-lifecycle action — `markReady`, `markOutForDelivery`, `completeOrder`, `refundOrder` | Extracted a shared `bestEffort()` helper (`lib/best-effort.ts`) — catches and logs, never rethrows — consolidating checkout's previously-local copy and applying it at all five call sites total (the four in `orders.service.ts` plus checkout's own), reducing the risk of the same mistake recurring at a future sixth site. |
| **H-13** | The payment webhook endpoint had no rate limiter | Added `webhookRateLimiter` (100/min, IP-keyed) and applied it to `paymentWebhookRouter`. |
| **H-14** | Every staff-auth-gated commerce router had no rate limiter | Added `staffActionRateLimiter` (60/min) and applied it to every route on `paymentsRouter`, `posRouter`, `couponsRouter`, staff `ordersRouter`, `deliveryRulesRouter`, `fulfillmentRouter`, and `menuCommerceRouter`. |

---

## 2. Files Changed

### Backend (`apps/api`)

**Schema (`prisma/schema.prisma`):** `NotificationType.DRIVER_REASSIGNED_AWAY`, `NotificationType.PASSWORD_RESET_REQUESTED`, `OutboxEvent` (new model), `CustomerRefreshToken` (new model), `CustomerPasswordResetToken` (new model), plus back-relations on `Customer`. No column changes to any pre-existing model.

**New files:**
- `lib/best-effort.ts` (+ test)
- `middleware/rate-limit-registration.test.ts`
- `modules/commerce/events/outbox-worker.ts` (+ test)
- `modules/commerce/events/outbox-scheduler.ts`
- `modules/commerce/events/record-order-event.test.ts`
- `modules/commerce/checkout/checkout.errors.test.ts`

**Modified (non-test):**
- `middleware/rate-limit.ts` — `webhookRateLimiter`, `staffActionRateLimiter`
- `index.ts` — wires `startOutboxWorker()` alongside the existing stale-offer scheduler
- `modules/commerce/payments/payments.routes.ts`, `modules/commerce/pos/pos.routes.ts`, `modules/commerce/coupons/coupons.routes.ts`, `modules/commerce/delivery-rules/delivery-rules.routes.ts`, `modules/commerce/fulfillment/fulfillment.routes.ts`, `modules/commerce/menu-commerce/menu-commerce.routes.ts`, `modules/commerce/orders/orders.routes.ts` — rate limiters + `requireIdempotencyKey` on `mark-paid`/`refund`
- `modules/commerce/orders/{orders.service,orders.controller}.ts`
- `modules/commerce/payments/orchestrator.ts`
- `modules/commerce/checkout/{checkout.errors,checkout.service,checkout.controller}.ts`
- `modules/commerce/coupons/coupons.service.ts`
- `modules/commerce/fulfillment/fulfillment.service.ts`
- `modules/commerce/delivery-rules/{smart-routing,zones.service}.ts`
- `modules/commerce/events/{event-bus,record-order-event}.ts`
- `modules/commerce/notifications/notifications.service.ts` — `sendDriverReassignedAwayNotification`, `sendPasswordResetEmail`
- `modules/commerce/customers/{customer-jwt,customers.service,customers.controller,customers.errors,customers.validation,index.routes}.ts`

**Modified/added tests:** every file above that has a `.test.ts` counterpart was extended in place with regression coverage for its specific fix (see §3).

### Frontend (`apps/web`)

No changes — this sprint's scope was entirely `apps/api` (all 13 High findings were backend-only).

---

## 3. Tests Added

Every fix has at least one dedicated regression test; highlights per finding:

- **H-2/H-4:** repeat-call no-op tests for `markPaidCash`; idempotency-key reserve/complete/fail coverage for both `markPaidHandler` and `refundHandler`; over-refund-limit and exact-boundary tests for `refundOrderPayment`.
- **H-3:** a security-focused test asserting a fake raw provider secret string never appears in the JSON response body, and that the body equals the exact safe, generic `publicMessage`.
- **H-5:** a guest reusing an existing `GuestCustomer` (found by email) is blocked by the per-customer coupon cap the same way a logged-in customer is; a repeat guest checkout under the same email reuses one `GuestCustomer` row instead of creating a duplicate.
- **H-6:** reset-request always resolves regardless of whether the email exists (no enumeration signal); reset-confirm rejects an unknown/expired/already-used token with the same generic error; a successful reset/change-password updates the hash and revokes every existing session; change-password rejects an incorrect `currentPassword`.
- **H-7:** a refresh token is stored hashed, never in plaintext; `logoutHandler` revokes the presented token and a subsequent `refreshHandler` call with it is rejected; `refreshHandler` rotates on every use and a second use of the old token is rejected (replay protection).
- **H-8:** reassigning driver A → driver B notifies both (A "reassigned away", B "new offer"); a first-ever assignment (no prior driver) sends only the new-offer notification; a prior *terminal* (e.g. `DECLINED`) assignment does not trigger a reassignment notice.
- **H-9:** a fallback rule that is itself `RESTAURANT_DRIVER` and also over the concurrency limit is skipped, not selected — the chain continues past it; `updateRule` rejects a self-referencing `fallbackToRuleId` and a two-rule mutual-fallback cycle.
- **H-10:** a smoke test confirming the module's built-in debug-log subscriber receives every emitted event.
- **H-11:** `writeOrderEvent` writes both `OrderEvent` and `OutboxEvent` against the same `tx`; `processOutboxBatch` dispatches unprocessed rows oldest-first, marks them `processedAt`, and — critically — leaves a row unprocessed for retry when dispatch throws, rather than marking it processed despite the failure.
- **H-12:** for each of `markReady`/`markOutForDelivery`/`completeOrder`/`refundOrder`, a notification-send failure does not cause the function itself to throw; a dedicated `bestEffort()` unit test (catches and logs, never rethrows, for both `Error` and non-`Error` thrown values).
- **H-13/H-14:** a generic `everyRouteUses(router, middleware)` structural test helper (reference-equality check against `router.stack`) confirming the correct rate limiter is registered on every route of every affected router, without needing to enumerate each path individually.

Net result: **822 passing tests** (813 `apps/api` + 9 `apps/web`, unchanged from Sprint 07.6's frontend baseline since this sprint touched no frontend code).

---

## 4. Verification Results

Run from the repo root unless noted:

| Step | Result |
|------|--------|
| `prisma validate` | ✅ Pass |
| `prisma generate` | ✅ Pass |
| `pnpm -r lint` (api + web) | ✅ Pass, no warnings |
| `pnpm -r typecheck` (api + web) | ✅ Pass |
| `pnpm -r test` | ✅ **822 / 822 passing** (813 `apps/api` + 9 `apps/web`) |
| `pnpm -r build` (api `tsc`, web `next build`) | ✅ Pass, all 28 web routes compiled |

No test was skipped, weakened, or deleted to make the suite pass. No pre-existing passing test was left broken by any fix in this sprint.

---

## 5. Remaining Medium Findings (Sprint 07.8 — not started, per instruction)

All 19 Medium-priority findings from the remediation plan remain open, unchanged by this sprint:

- **M-1** — No encryption key rotation or versioning for BYOP credentials
- **M-2** — Encrypted credential ciphertext is exposed in API responses
- **M-3** — Cumulative partial refunds never flip `Order.status` to `REFUNDED`
- **M-4** — Refunding a cash order produces a raw 500 instead of a clean 4xx
- **M-5** — `nextOrderNumber` race produces an unhandled 500 under concurrent checkout
- **M-6** — `getOrCreateActiveCart` check-then-create race produces duplicate active carts
- **M-7** — No guest-cart-to-customer merge on login
- **M-8** — No cart expiry/cleanup job; `expiresAt` is written and never enforced
- **M-9** — Tracked inventory (`quantityAvailable`) is never decremented on order placement
- **M-10** — No guest-order-to-customer-account linking
- **M-11** — `createFavorite` doesn't validate that the menu item belongs to the given restaurant
- **M-12** — Public order-tracking endpoint over-shares and has no rate limiter
- **M-13** — Kitchen capacity's concurrent-order check is a check-then-act race
- **M-14** — Driver location staleness is never checked anywhere
- **M-15** — Active-driver-assignment count on the checkout hot path has no restaurant-scoped index
- **M-16** — Restaurant open/closed evaluation uses the server's timezone, not the restaurant's
- **M-17** — No CSRF token mechanism
- **M-18** — Missing compound index for combined order-status-and-source filtering
- **M-19** — Currency is hardcoded to `"usd"` throughout the payment path

(The remediation plan's Low-priority findings, L-2 through L-11, also remain open and untouched — listed in `SPRINT_07_6_REMEDIATION_PLAN.md` for reference, out of scope for both this sprint and the Medium-priority sequencing above.)

None of these were touched, per the explicit instruction to fix only the High findings this sprint.

---

## 6. Notes / Residual Risk Carried Forward

- **H-5:** the per-guest coupon limit is necessarily email-keyed, not identity-verified — `GuestCustomer` has no account/verification step, so a guest willing to use a different email each time is not blocked. Closing that fully would require an account/verification requirement for per-customer-limited coupons, a larger product decision explicitly out of scope here.
- **H-7:** this fix adds revocation and rotation, not anomaly-based reuse-*detection* (e.g., proactive alerting when a revoked/rotated-away token is presented). Full reuse-detection parity with staff auth's more elaborate design is a reasonable future enhancement, not required to close this specific finding.
- **H-9:** the 5-hop fallback-chain bound (both in `resolveFallback` and `validateFallback`'s cycle check) is defense in depth against pre-existing bad data — with creation-time cycle rejection now in place, it's not expected to be exercised in practice.
- **H-10/H-11:** the event bus is now durable (outbox-backed) but still single-instance-only — no multi-instance claim coordination (e.g. `SELECT ... FOR UPDATE SKIP LOCKED`). This is a reasonable, standard tradeoff for the current single-process deployment model and must be revisited before horizontal scaling; any real subscriber built on the outbox worker must be written idempotently from day one (at-least-once delivery).
- **H-6:** email delivery for the password-reset link depends on the notifications module's real email adapter being correctly configured for the environment — this fix does not change the notifications module's own delivery guarantees.

---

*Do not start Sprint 07.8 without explicit instruction.*
