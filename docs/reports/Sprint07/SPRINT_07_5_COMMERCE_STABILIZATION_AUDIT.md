# Sprint 07.5 — Commerce Stabilization Audit

**Type:** Read-only engineering audit. No code was modified, no commits were made, no PR was opened.
**Scope:** Full Sprint 07 Commerce & Fulfillment Engine — backend (`apps/api/src/modules/commerce/**`), frontend (`apps/web/src/app/order/**`, `apps/web/src/app/account/**`, `apps/web/src/app/dashboard/**`), schema (`apps/api/prisma/schema.prisma`), and cross-cutting concerns (security, rate limiting, event architecture).
**Method:** Four parallel deep-read research passes covering (1) payments and money movement, (2) cart/checkout/orders/coupons/customers, (3) fulfillment/delivery-rules/QR-ordering/POS/kitchen, and (4) event-bus/notifications/loyalty/cross-cutting security and frontend — followed by synthesis, deduplication, and severity classification.

## How to read this report

Every finding has a stable ID (`C-#` Critical, `H-#` High, `M-#` Medium, `L-#` Low). Each ID's **full** write-up — Description, Why It Matters, Severity, Recommendation — appears exactly once, in its severity section (§30–§33). The 19 thematic module sections (§2–§24) reference findings by ID with a one-line summary so you can read either "by module" or "by severity" without wading through duplicated text. All file:line citations reflect the state of the repository at the time of this audit (branch `claude/sprint-07-commerce-engine`, post Sprint 07 completion).

**Total findings: 60** — 15 Critical, 14 High, 19 Medium, 12 Low.

---

## 1. Executive Summary

The Sprint 07 commerce engine is architecturally sound at the level engineers usually get credit for: module boundaries are clean and one-directional, the adapter/registry pattern is applied consistently across four provider families (payments, fulfillment, POS, notifications), tenant isolation (`restaurantId` ownership) is rigorously and consistently enforced, the order state machine is genuinely centralized, and the test suite (663 tests) covers the happy path of nearly every module in real depth.

What this audit found is a consistent pattern sitting underneath that solid foundation: **the code that runs when nothing goes wrong is well built; the code that runs when something fails, or when two requests race each other, is largely missing.** Every Critical finding in this report is one of three shapes:

1. **Money moves and the system loses track of it** — unvoided authorizations, refunds reported as successful when they failed, a double-charge path reachable through ordinary client retry behavior.
2. **A security boundary is documented in a comment but not enforced in code** — cart/order ownership, the QR token's stated role as "sole authorization," delivery-zone polygon geometry.
3. **The customer-facing UI doesn't match what the backend actually requires** — there is no payment-tokenization UI at all, so no card or wallet payment can succeed today.

None of these require an adversary. A network blip during capture, a double-click on "place order," two browser tabs, or a busy Friday-night rush is sufficient to trigger the majority of the Critical findings below. The system is not currently safe to process real, paid customer orders. It **is** capable of running a very narrow cash-only, pickup-only pilot with close supervision, which is a meaningfully different claim than "production ready."

---

## 2. Architecture Review

**Assessment: Strong, with two structural debts to resolve before building further on top of it.**

The `apps/api/src/modules/commerce/` domain is split into 14 sub-modules (`cart`, `checkout`, `orders`, `payments`, `fulfillment`, `delivery-rules`, `menu-commerce`, `coupons`, `customers`, `pos`, `qr-ordering`, `loyalty`, `events`, `notifications`) with a deliberately one-way, acyclic dependency graph: `checkout` depends on `cart`/`menu-commerce`/`delivery-rules`/`payments`; `orders` depends only on `checkout`'s output; `fulfillment` depends on `orders`/`delivery-rules`; `pos` and `qr-ordering` are alternate order-source entry points that funnel into the same `checkout`/`orders` core instead of forking it; `events`/`notifications`/`loyalty` are pure subscribers nothing in the core flow imports back. This is genuinely well executed and verified by direct inspection — no circular imports were found.

The adapter/registry pattern (one interface, one class per provider, one Map-based registry with an `implemented` flag) is applied identically across payments, fulfillment, and POS, which is a real strength: adding a sixth payment provider or a fourth delivery provider is a new file plus two registry lines, not a redesign.

Two structural debts stand out:

- **§24 Event Bus** — the event-driven architecture described in code comments (event bus feeding notification dispatch, timeline projection, fraud evaluation) does not actually exist yet; `emitOrderEvent()` is called throughout the codebase into a bus with zero production subscribers (H-10), and the bus itself is a bare in-process `EventEmitter` with no persistence (H-11). This is fine today only because nothing depends on it; it is the single biggest thing to get right before Sprint 08 builds real subscribers on top of it.
- **Payment failure/retry has no compensating-action layer.** `void()` exists as a fully-implemented capability on the Stripe adapter and is never called anywhere (C-3, C-4). This tells us the "orchestration" layer was designed for the success path and the failure path was not designed with the same rigor — see §7 and §25.

## 3. Database Review

**Assessment: Schema design (types, relations, tenant-scoping indexes) is solid; several concurrency-safety and lifecycle-completeness gaps exist.**

- Every model follows the established convention (UUID `id`, `createdAt`/`updatedAt`, explicit `@@index` on FK/status/date columns) — this consistency is good and matches prior sprints' standard.
- **Missing constraints that would prevent real races:**
  - No unique constraint on `Cart(restaurantId, customerId, status)` / `Cart(restaurantId, guestSessionId, status)` — enables M-6 (duplicate active carts).
  - No unique constraint on `CouponRedemption(couponId)` / `CouponRedemption(couponId, customerId)` beyond `orderId @unique` — enables C-8 (coupon over-redemption race).
  - No per-driver uniqueness/exclusion on `DriverAssignment` beyond `fulfillmentId @unique` — enables C-9 (driver double-booking).
- **Written-but-never-read columns:** `Cart.expiresAt` is set at creation and never consulted by any query (M-8). `CartStatus.ABANDONED`/`EXPIRED` enum values exist and are never assigned by any code path. `MenuItemInventory.quantityAvailable` is read for eligibility but never decremented on order placement (M-9) — tracked inventory provides no actual oversell protection.
- **Indexing gaps on hot paths:** `DriverAssignment` has no `restaurantId` column or index, forcing a join-filtered count on every checkout quote (M-15). `Order` has separate `[restaurantId,status]` and `[restaurantId,source]` indexes but no compound index for filtering both simultaneously (M-18).
- **Confirmed clean:** `GiftCard`/`GiftCardTransaction`/`LoyaltyProgram`/`LoyaltyAccount`/`LoyaltyTransaction` exist, pass validation, and are provably unreferenced by any service/controller code (L-7) — this is intentional future-reserved schema, not a half-built feature, and is the one part of this review with no risk attached.
- **Encryption is application-level, not database-level** — `credentialsEncrypted`/`webhookSecretEncrypted` are `String` columns holding AES-256-GCM ciphertext; the schema itself carries no key-version metadata, which is the DB-facing half of M-1.

## 4. API Review

**Assessment: REST conventions and status-code choices are consistent across most of the surface; error-type handling and rate-limiter coverage are inconsistent.**

- Status-code conventions (200 for read/connect, 201 for create, 204 for delete, 404/400/409/422 for typed errors) are applied consistently in the modules that were built with a full typed-error chain (orders, cart, checkout, fulfillment).
- **Typed errors that are defined but never thrown or caught:** `PaymentNotFoundError` and `CheckoutInProgressError` (L-10) — both exist in their module's `errors.ts` and are never used, meaning the corresponding real-world cases (refunding a cash order, a genuinely in-progress duplicate checkout) fall through to a generic 500 instead of the clean 4xx the codebase's own pattern would produce (M-4).
- **The webhook controller has a dead/misleading routing element:** the `:providerType` URL segment is captured but never actually checked against the resolved provider (L-2) — correctness today comes entirely from `?providerId=` plus HMAC signature verification, so this isn't exploitable, but it's a trap for whoever wires up the second payment provider.
- **Rate-limiter coverage is inconsistent across the API surface**: cart, checkout, and customer-auth routes all have limiters; the payment webhook endpoint (C-15's blast radius, H-13), every staff-auth-gated commerce router (H-14), and the public order-tracking endpoints (M-12) do not.
- **The public order-tracking endpoint over-shares** — `GET /api/public/orders/:id` returns the full `Order` row with no field selection (M-12), including internal notes and fee breakdowns never intended for a public tracking widget.
- **Inconsistent failure-mode error shape between authorize and capture**: authorize-time failures map to a typed `PaymentFailedError`/402; capture-time failures throw a generic `Error` that isn't recognized by the same catch chain, producing an inconsistent 500 for what is conceptually the same class of failure (see §7).

## 5. Frontend Review

**Assessment: The three frontend surfaces (customer, owner, staff) are functionally complete for their respective happy paths, but the customer checkout page has a payment-capability gap that blocks the entire commerce loop, and error handling is inconsistent.**

- **C-1 (critical, cross-referenced from §7/§9):** the checkout page presents a full list of payment method radio options (Apple Pay, Google Pay, Visa/Mastercard/Amex/Discover, cash) but only ever sends `methodType` — no `methodToken` is ever collected or sent, for any method. There is no Stripe Elements, Payment Request Button, Apple Pay JS, or Google Pay API integration anywhere in the codebase. This is the single highest-impact frontend gap in the entire audit.
- **Cart identity is trusted purely via a client-supplied UUID** stored in `localStorage`, keyed only by restaurant (not by any session token) — this is the frontend half of the cart IDOR (C-14): nothing about the storage mechanism prevents a `cartId` from being used by anyone who obtains it.
- **Inconsistent error handling** — several mutation handlers (cart quantity change, fulfillment change, coupon removal, address/favorite deletion) have no try/catch at all (L-8); a failed request produces no visible feedback, in contrast to sibling handlers in the same files that do catch and surface errors correctly.
- **No auth-guard/redirect pattern on the owner dashboard** (L-9) — an expired staff session produces a generic "failed to load" message instead of a redirect to `/login`, unlike the customer-facing `/account` page, which correctly redirects on a 401. Not a security hole (the API is the real enforcement boundary) but a real UX rough edge for staff.
- **Positive findings:** the checkout page correctly itemizes tax/delivery-fee/service-fee/discount/tip as separate line items (matching the spec's explicit requirement); the QR landing page correctly resolves a token server-side before creating a cart; the driver view's geolocation-ping logic correctly guards on browser permission and only pings while `EN_ROUTE`.

## 6. Commerce Engine Review

Summary assessment across all 14 modules, severity-weighted:

| Module | Structural Quality | Highest Severity Found |
|---|---|---|
| Cart | Good design, missing ownership checks | Critical (C-14) |
| Checkout | Excellent design, missing failure-path handling | Critical (C-1 through C-6) |
| Orders | Excellent — genuinely centralized state machine | Critical (C-7) |
| Payments/BYOP | Excellent adapter design, missing compensating actions | Critical (C-3, C-4, C-6) |
| Fulfillment | Good CRUD, missing dispatch reliability | Critical (C-9, C-10, C-11) |
| Delivery Rules | Good fee/config modeling, one core feature is dead code | Critical (C-12) |
| QR Ordering | Excellent token design, bypassed at the integration point | Critical (C-13) |
| POS | Clean — fully correct for its stub-only scope | None |
| Coupons | Good validation logic, race-unsafe | Critical (C-8) |
| Loyalty | N/A — correctly inert placeholder | None |
| Notifications | Simple and functional, unsafe when it fails | Critical (C-15) |
| Customers | Good separation from staff auth, missing account-recovery | High (H-6, H-7) |
| Kitchen (capacity) | Correct logic, race-unsafe | Medium (M-13) |
| Event Bus | Well-typed, currently unused | High (H-10, H-11) |

The remainder of this report expands each of these.

## 7. Payment Orchestration Review

The multi-provider failover design itself is correct and well-tested: `authorizeOrderPayment` builds a priority-ordered candidate list of `CONNECTED` providers, tries each through the adapter interface, records one `PaymentAttempt` per try, and returns on first success — a disconnected or erroring primary provider transparently fails over, and the customer never sees which provider was used. This is genuinely solid work.

What's missing is everything that happens when a step *after* a successful provider call fails:

- **C-4**: the provider `authorize()` call can succeed (card held) before the `PaymentAttempt` DB row is written; if that write fails, there is no record anywhere of the provider's payment-intent ID, and the webhook reconciliation path — which looks up by that exact ID — can never find it. Untracked money-in-limbo.
- **C-3**: if `authorize()` succeeds but the immediately-following `capture()` call throws, the code marks the order `FAILED` and stops — `adapter.void()` is fully implemented and never called. The customer's card keeps a live hold the app has no record of trying to resolve.
- **C-6**: any provider response other than immediate success or failure — most notably `requires_action` (a 3D Secure / SCA challenge, which is common for EU-issued cards and increasingly used for US risk-based authentication) — is treated as an outright decline. There is no `client_secret`/`next_action` handling and no confirmation-completion endpoint.
- **C-7**: on the refund path, a provider-side refund failure is recorded correctly as `Refund.status: "FAILED"` internally, but the caller (`orders.service.refundOrder`) never inspects that status before flipping the order to `REFUNDED` and telling the customer their money is on its way.
- Two capabilities are implemented at the adapter level and are architecturally dead: `void()` (see C-3) and partial capture (`captureOrderPayment` always passes `amountCents: undefined`, even though the Stripe adapter supports partial capture) — worth noting as technical debt (§27) independent of the money-impact findings above.
- **Currency is hardcoded to `"usd"`** throughout the checkout path (M-19) — no immediate bug, but a real architectural ceiling if multi-currency is ever required.

## 8. BYOP Architecture Review

The core BYOP (Bring Your Own Payment) mechanics are sound: a restaurant can hold multiple simultaneously `CONNECTED` `PaymentProvider` rows, credentials and webhook secrets are AES-256-GCM encrypted at rest with a random IV per encryption and the auth tag verified on decrypt, and the encryption library fails closed if the key is missing or the wrong length.

Two gaps sit around that solid core, not in it:

- **M-1**: the ciphertext format carries no key-ID/version, so rotating `COMMERCE_ENCRYPTION_KEY` — a legitimate, expected operational event over the platform's lifetime — makes every previously-stored credential permanently undecryptable, with no migration path.
- **M-2**: `listProviders`/`connectProvider` return full Prisma rows to the owner-facing API, including the raw `credentialsEncrypted`/`webhookSecretEncrypted` ciphertext, with no field selection before serialization. Not plaintext, but unnecessary exposure that increases blast radius if the encryption key is ever compromised, and violates least-exposure practice for financial credentials.

Webhook signature verification itself (§19 detail) is genuinely correct: real HMAC verification against the exact raw request bytes, per-restaurant decrypted secret, with Stripe's SDK enforcing its own replay-window tolerance, plus a `WebhookEvent` unique-constraint dedup that correctly treats replays as 200-OK no-ops.

## 9. Apple Pay / Google Pay / Cash Payment Review

- **Apple Pay / Google Pay**: not implemented at any layer beyond an enum value. The frontend has zero wallet SDK integration (C-1). Even setting the frontend gap aside, the backend's `PaymentMethodType` is purely a routing/label field — `orchestrator.ts` doesn't pass `methodType` into the adapter's `authorize()` call at all, and the Stripe adapter hardcodes `payment_method_types: ["card"]`, so there is no wallet-specific token verification, merchant validation, or domain-association handling even on the server side. Today, selecting either wallet option in the UI is guaranteed to fail every time.
- **Cash payments** (`CASH_ON_DELIVERY`/`CASH_AT_PICKUP`) work correctly for the single-attempt case — they bypass the provider entirely by design and correctly produce no `Payment` row until staff marks the order paid. The one real gap is **H-2**: `markPaidCash` is the only order-lifecycle action that bypasses the shared state-machine transition helper and has no idempotency guard, so a double-click or retried request writes two `Transaction` rows and double-books cash revenue.
- **Saved cards**: `CustomerPaymentMethod.providerToken` is fully modeled and has working CRUD, but is never read by `checkout.service.ts` or the orchestrator (L-11) — there is no code path that turns a saved payment method into the `methodToken` used at checkout. This data is currently inert.

## 10. Fulfillment Engine Review

The CRUD layer (provider connect/disconnect, fulfillment status updates, driver assignment record-keeping) is solid and well-tested. The dispatch *reliability* layer — the part that actually gets a real delivery to a real driver — has three critical gaps that compound each other:

- **C-9**: `assignDriver` checks that the driver is staff at the restaurant, but never checks whether that driver already has another active assignment. The same driver can be offered two overlapping deliveries simultaneously with no system awareness of the conflict.
- **C-10**: there is no push/SMS/any notification triggered when a driver is offered a delivery, despite push and SMS provider stubs already existing and being registered in the notifications module. The only way a driver learns of a new offer is by actively polling `GET /me/fulfillment/my-assignments`.
- **C-11**: `DriverAssignment` has no expiry/TTL field, and there is no scheduled job anywhere in the codebase that reassigns or expires a stale `OFFERED` assignment. Combined with C-10, an order can become permanently stuck if the assigned driver's app happens to be backgrounded when the offer is created.
- **H-8**: because assignment is an upsert keyed on `fulfillmentId`, reassigning a delivery to a different driver silently overwrites the original driver's record — a driver already `EN_ROUTE` gets no explicit signal that the job was taken from them; it simply disappears from their next poll.

## 11. Delivery Rules Review

Fee/config modeling (flat/per-mile/percentage fee rules, radius vs. rule-based mode, min-order enforcement) is implemented as specified and is well tested. Two findings undercut the routing engine's core correctness claim:

- **C-12**: `evaluateRouting` accepts `deliveryZones` in its input and the caller fetches and passes them through in production, but the function body never actually references them. Zone containment (both radius and polygon) is implemented as pure, independently-tested functions that are never called from the routing decision itself — eligibility is decided purely by straight-line haversine distance against a rule's min/max distance band. A restaurant that draws a polygon specifically to exclude an unreachable area (across a river, wrong side of a highway) gets zero enforcement of that shape.
- **H-9**: when a primary `RESTAURANT_DRIVER` rule is blocked by the busy-driver check, its configured fallback rule is returned unconditionally without re-checking whether the fallback is *also* `RESTAURANT_DRIVER` and *also* over the concurrency limit. Fallback-rule validation doesn't even prevent a rule from listing itself as its own fallback, which permanently disables the busy check for that rule. This is reachable through normal (if careless) admin configuration, not an attack.
- **M-16**: `isRestaurantOpenAt` evaluates the current time in the server's local timezone; there is no `timezone` field on `Restaurant` anywhere in the schema. Since this is the very first gate `evaluateRouting` checks, a server/restaurant timezone mismatch incorrectly accepts or rejects every order, platform-wide, for the affected restaurant.

## 12. Restaurant Driver Workflow Review

Beyond the dispatch-reliability findings already covered in §10, the driver-facing surface itself (accept/decline, mark picked up/delivered, location ping) is functionally correct and reasonably tested. The one standing gap:

- **M-14**: `currentLat`/`currentLng`/`lastLocationAt` are written on every ping but never read anywhere else in the codebase — no staleness check exists, nothing compares `lastLocationAt` against "now" before treating a position as current, and Smart Routing doesn't take driver position as an input at all. Today this is low-impact because nothing downstream actually depends on freshness, but it is a latent trust hazard the moment any UI surfaces "live" driver location to staff or customers without adding a staleness check at that point.
- **M-15**: the per-checkout call to count a restaurant's active driver assignments runs a join with no restaurant-scoped index on the `DriverAssignment` table — a hot-path performance concern that will surface as delivery volume grows.

## 13. QR Ordering Review

Token generation and regeneration are implemented correctly and are a genuine strength: 192 bits of entropy per token, and regenerating a table's token immediately invalidates the old one for future *resolution* calls. The problem is that resolution isn't actually required to use a table ID:

- **C-13**: both cart-creation and set-fulfillment endpoints accept a raw, client-supplied `tableId` with no verification that it belongs to the restaurant the cart is being created for, that the table is active, or that the request ever went through the QR-token resolution endpoint at all. The schema's own code comment states the token is "the sole authorization for which restaurant and table this order is attributed to" — the implementation directly contradicts that. A `tableId` is trivial to obtain (it's returned in plaintext by the resolve endpoint) and, once known, can be used to create dine-in carts indefinitely, including for a table belonging to a *different restaurant*, regardless of whether the token behind it has since been regenerated.

## 14. POS Integration Review

Clean. All five adapters (Square, Clover, Toast, Lightspeed, Generic) consistently and correctly throw a typed "not implemented" error from every method, correctly report `implemented: false`, and the sync-trigger path correctly writes a `FAILED` `POSSyncLog` row before rethrowing rather than leaving any half-written state. This module does exactly what it says it does and needs no changes for its current stub-only scope. No findings.

## 15. Customer Journey Review

Registration, login, and JWT-based session handling are correctly separated from staff auth (distinct cookie names, distinct token `kind` discriminators, so a customer token can never be replayed as a staff token or vice versa). Two significant account-lifecycle gaps exist:

- **H-6**: there is no password-reset or password-change mechanism anywhere — a customer who forgets their password has no in-app recovery path, ever.
- **H-7**: customer refresh tokens are self-contained 30-day JWTs with no server-side revocation table (unlike staff auth's opaque, DB-backed `RefreshToken`). Logout only clears cookies; the token itself remains valid for the full 30 days from any device that captured it. Combined with H-6, a leaked refresh token is effectively permanent — the account owner has no way to invalidate it.
- **M-7**: no code path merges a guest session's cart into a customer identity on login/registration — a browsing session's cart is silently orphaned the moment the customer logs in.
- **M-10**: no code path links a guest order to a customer account created later with the same email — order history never reconciles across the guest/customer boundary.
- **M-11**: `createFavorite` doesn't validate that the supplied `menuItemId` actually belongs to the supplied `restaurantId`, allowing a mismatched pair to silently corrupt restaurant-scoped favorites queries.

## 16. Checkout Flow Review

The checkout engine's core design decisions are genuinely good: quotes are computed fresh on every call rather than cached-with-expiry (avoiding an entire class of stale-quote bugs), order creation happens in one atomic transaction before any external payment call, price drift is re-validated against current menu prices at placement time, and idempotency keys are reserved via a real Postgres unique-constraint race rather than a check-then-write pattern.

The gap is entirely in what happens after that solid core, once a real payment is involved — this is where the majority of this audit's Critical findings live:

- **C-5**: nothing checks `cart.status` before processing a checkout request. The cart is marked `CONVERTED` only as a side effect of a successful placement; a second `place-order` call against the same cart with a different idempotency key sails through and creates a second order with a second real charge.
- **C-2**: the payment authorize/capture block is correctly wrapped in a try/catch, but the steps that run immediately after — sending the confirmation notification, the final order fetch — are not, even though they run *after* the customer has already been charged. If any of those steps throws, the idempotency key is marked `FAILED`, and the idempotency library's own design treats a `FAILED` key as retryable — so the natural client retry (the frontend deliberately preserves the same key until success) replays the entire checkout and charges the customer a second time for an order that already succeeded.
- **C-15**: the specific, most likely trigger for C-2 in practice is a notification-send failure (§19) — this is called out as its own finding because it's the most probable real-world path into C-2's blast radius, not a hypothetical one.

## 17. Order Lifecycle Review

The centralized state machine (`order-state-machine.ts`) is a real strength — a single `TRANSITIONS` table is verifiably the only place in the codebase permitted to change `Order.status`, confirmed by a repo-wide check for any `prisma.order.update` call outside the two files that respect it. The lifecycle actions built on top of it (start preparing, mark ready, mark out for delivery, complete, cancel) are correctly implemented and tested.

The two lifecycle actions that touch money directly are where the findings concentrate:

- **H-2** (also §9): `markPaidCash` uniquely bypasses the shared transition helper and has no idempotency guard.
- **C-7** (also §7): refund failures are reported as successes to both the order record and the customer-facing notification.
- **H-4**: the refund endpoint has no idempotency-key requirement, despite the shared idempotency middleware's own code comment explicitly naming refund as an endpoint that needs it, and no application-level check that a refund amount doesn't exceed the remaining refundable balance before calling the provider.
- **M-3**: two sequential partial refunds that together sum to the full order total each independently evaluate as "not a full refund" (the check only compares the *current* request against the total, ignoring prior refunds), leaving `Order.status` stuck away from `REFUNDED` even after the underlying `Payment.status` correctly reaches it — a real dashboard-facing data-integrity bug.
- **M-4**: refunding a cash order (which has no `Payment` row) throws a raw, untyped `Error` instead of the typed error that exists for exactly this case, producing a generic 500 for a routine staff action instead of a clean 4xx.
- **M-12**: the public order-tracking endpoint has no rate limiter and returns the entire `Order` row with no field selection.
- **L-4**: if the process crashes between order creation and payment resolution, the order is permanently stuck `PENDING_PAYMENT` with no automated timeout/recovery — staff *can* manually resolve it (the transition is state-machine-legal), but nothing surfaces that it needs attention.

## 18. Kitchen Workflow Review

The capacity model itself — manual pause/resume, auto-pause at a configured concurrent-order threshold — is correctly implemented and independently unit-tested. The only finding here is a concurrency gap, not a logic gap:

- **M-13**: the active-order count that feeds the capacity check is read outside any transaction or row lock. Two checkout requests arriving at the same instant, right at the configured threshold, will both read the same "not yet at capacity" count and both proceed — silently overshooting the cap. This is most likely to occur during exactly the rush-hour conditions the feature exists to protect against.

## 19. Notification System Review

The notification dispatch mechanism itself is simple and functional for the success case: a real email adapter plus stub SMS/push adapters behind a shared registry, with seven named convenience wrappers covering the order lifecycle's key moments. The problems are entirely in what happens when dispatch fails:

- **C-15**: `sendOrderConfirmation` is awaited, unguarded, immediately after a successful payment capture in the checkout flow. If the underlying notification-log write throws, the exception propagates all the way up through an already-successful checkout, past a controller catch chain that doesn't recognize the error type, and produces a 500 to a customer who has already been charged — this is the concrete, most-likely trigger for C-2's double-charge path.
- **H-12**: the identical unguarded-await pattern exists on every staff-facing order-status transition (mark ready, mark out for delivery, complete, refund) — a transient notification failure turns an already-successful, already-persisted status change into a 500 returned to staff.
- **H-10 / H-11**: notifications are dispatched via direct synchronous function calls, not through the event bus the architecture documents describe — meaning the event bus is currently decorative for this exact use case, and there is no retry queue or dead-letter handling for a failed notification; it either succeeds inline or it takes down the request that triggered it (see above).

## 20. Security Audit

Consolidated view of every security-relevant finding across the modules above (each already carries its full write-up in §30–§33; this section is the security-specific index):

- **Broken object-level authorization (IDOR):**
  - **C-14** — cart read/mutation endpoints never check the caller's identity against the cart's owner; a leaked `cartId` is a full read/write capability, including the ability to place an order attributed to someone else's account.
  - **C-13** — the QR dine-in `tableId` binding never verifies the caller went through token resolution, letting any client bind a cart to an arbitrary table, including one belonging to a different restaurant.
  - **M-12** — the public order-tracking endpoint discloses the complete internal order record to anyone holding the order ID, with no rate limiting.
- **Payment-adjacent information disclosure:**
  - **H-3** — raw provider decline messages (`insufficient_funds`, `invalid_cvc`, etc.) are returned verbatim on the public, unauthenticated checkout endpoint — a card-testing oracle.
  - **M-2** — encrypted credential ciphertext is included in owner-facing API responses with no field selection.
- **Account security:**
  - **H-7** — customer refresh tokens have no server-side revocation mechanism and survive logout.
  - **H-6** — no password-reset path compounds the above into a permanent exposure once a credential leaks.
- **Missing platform-wide protections:**
  - **H-13 / H-14** — no rate limiting on the payment webhook endpoint or any staff-auth-gated commerce router.
  - **M-17** — no CSRF token mechanism; the system relies solely on `SameSite=lax` cookies for defense against cross-site state-changing requests on money-moving endpoints.
  - **L-6** — auth rate limiting is IP-keyed only, with no per-account lockout.
- **Confirmed sound:** tenant isolation (`restaurantId` ownership) is consistently and correctly enforced everywhere it was checked; webhook signature verification is real HMAC verification against raw bytes with correct replay-window and dedup handling; encryption-at-rest uses correct authenticated encryption with a fail-closed posture.

## 21. Performance Audit

- **M-15**: `countActiveDriverAssignments` runs on every single checkout quote computation with a join against `DriverAssignment`, which has no restaurant-scoped index — this is a hot-path query that will degrade as delivery volume grows.
- **M-18**: `Order` listing has separate indexes for `[restaurantId,status]` and `[restaurantId,source]` but no compound index for filtering by both simultaneously — low impact at current scale, worth adding if channel-and-status filtering becomes a common dashboard query.
- No unbounded list-fetch endpoints were found in the fulfillment/driver-tracking surface (table and driver-assignment listings are both naturally bounded by low real-world cardinality per restaurant).
- No N+1 query patterns were identified in the reviewed modules beyond the indexing gaps above — Prisma `include` usage was consistently reviewed and found to batch correctly.

## 22. Scalability Audit

- **H-11** is the headline finding: the event bus is a bare in-process `EventEmitter`. In a horizontally-scaled, multi-instance deployment, each process has its own disconnected bus — a handler registered in process A never fires for an event emitted by process B. There is also no outbox/replay mechanism, so a process crash between the durable event-log write and the in-process emit silently drops that event's downstream effects. This is not an active bug today only because there are no real subscribers yet (H-10) — it is the single most important thing to resolve architecturally before anything is built that depends on the bus for correctness (fraud detection, loyalty accrual, POS sync are all explicitly described as future consumers).
- Notification dispatch is fully synchronous and inline with the request that triggers it — there is no queue, so a slow or unavailable email/SMS/push provider directly slows down (or, per C-15/H-12, can fail) the checkout and order-management request paths that trigger it.
- Idempotency and webhook-dedup mechanisms are both correctly implemented against Postgres (not in-memory), meaning they are already safe under horizontal scaling — this is a genuine strength worth noting alongside the event-bus gap.

## 23. Multi-Tenant Isolation Audit

This audit specifically distinguishes two axes that are easy to conflate: **tenant isolation** (does a request only ever touch its own restaurant's data) and **identity isolation** (does a request only ever touch its own user's data within a restaurant). The codebase treats these very differently:

- **Tenant isolation is consistently and correctly enforced.** Every staff-facing service function that was reviewed re-checks `restaurantId` ownership explicitly (the `getOwnRestaurantId` + row-level ownership re-check pattern), and cross-tenant access consistently returns 404, never 403, matching the codebase's own documented convention. No cross-tenant data leak was found anywhere in scope.
- **Identity isolation (customer/guest-level ownership within a tenant) is not consistently enforced**, and this is the direct cause of the two most severe security findings in this report: cart ownership (C-14) and QR table-binding (C-13) are both cases where the *restaurant* boundary is either irrelevant or separately checked, but the *individual customer's* ownership of the specific resource is never verified. This strongly suggests the rigorous ownership-check pattern that was applied for the tenant axis simply wasn't extended to the identity axis — worth a systematic pass across the cart/checkout/order surface specifically for this, rather than one-off patches per endpoint.

## 24. Event Bus Review

The event bus itself is well-designed as far as its type system goes: `CommerceEvent<T>` is typed directly on the Prisma `OrderEventType` enum (a single source of truth), it supports wildcard `"*"` subscription, and — per this audit's direct confirmation — its handler-invocation code correctly wraps subscriber calls in both synchronous and asynchronous error isolation, so one failing subscriber cannot break another or crash the emitter.

The problem is that none of this is exercised in production:

- **H-10**: a repo-wide check confirms `commerceEventBus.on()` is called nowhere outside the bus's own unit test. Every `emitOrderEvent()` call throughout checkout and order-lifecycle code — which happens on every meaningful state transition — is emitted into a bus with zero listeners. All of that event traffic is currently discarded.
- **H-11**: the bus is backed by a bare Node `EventEmitter`, which is process-local memory with no persistence and no shared broker. This is the structural reason the event bus cannot be relied upon for anything durability-sensitive (fraud evaluation, loyalty accrual, POS sync) without first addressing horizontal-scaling and crash-recovery semantics — see §22.

This is flagged as High rather than Critical specifically because it is inert today; it is called out with this much emphasis because it is the piece of technical debt most likely to become a Critical production bug the moment Sprint 08 (reasonably) starts wiring real subscribers onto it, and it is far cheaper to address the durability model now than after multiple consumers depend on the current behavior.

## 25. Production Readiness Assessment

**Verdict: Not production-ready for real, paid customer orders.** A very narrow cash-only, pickup-only pilot, run under close supervision, is technically possible today; anything resembling normal multi-channel restaurant operation is not.

What works well enough to build on: tenant isolation, the order state machine, the multi-provider payment failover *design* (independent of its failure-path gaps), webhook signature verification, idempotency-key mechanics (independent of the retry-after-partial-failure gap), and the adapter/registry pattern across all four provider families.

What blocks a real launch, concretely:

1. No customer can complete a card or wallet payment today — this alone is a full stop for any restaurant that isn't cash-only.
2. Every money-movement failure path (capture failure, DB-write failure after authorization, refund failure) either loses track of the money or reports success when it didn't happen.
3. Two security boundaries described in code comments as load-bearing (cart ownership, QR-token-as-sole-authorization) are not actually enforced.
4. Driver dispatch has no notification and no timeout, meaning a real delivery order can silently never reach anyone.

None of this reflects a lack of engineering rigor in what was built — the depth of what *was* built (663 passing tests, a real centralized state machine, a real multi-provider orchestrator, real webhook cryptographic verification) is well above the bar for a sprint of this scope. It reflects that the failure-path and identity-authorization work was not yet done, and that work is precisely what stands between this codebase and its first paying customer.

## 26. Missing Features

- Real client-side payment tokenization (Stripe Elements / Payment Request Button) — see C-1.
- 3D Secure / SCA challenge completion flow — see C-6.
- Password reset and password change for customer accounts — see H-6.
- Server-side revocation for customer refresh tokens — see H-7.
- Guest-cart-to-customer-account merge on login/registration — see M-7.
- Guest-order-to-customer-account linking on later registration — see M-10.
- Driver offer push/SMS notification — see C-10.
- Driver offer timeout/auto-reassignment — see C-11.
- Cart expiry/cleanup background job — see M-8.
- Inventory reservation/decrement on order placement (tracked-stock oversell protection) — see M-9.
- Restaurant-level timezone configuration for hours evaluation — see M-16.
- Saved-card usage at checkout (data exists, is never read) — see §9 (L-11).
- Encryption key rotation/versioning for BYOP credentials — see M-1.
- Refund idempotency and over-refund guard — see H-4.
- Partial-capture and void/cancel-before-capture usage in the payment orchestrator (adapter capability exists, orchestration layer never calls it) — see C-3.
- CSRF token mechanism for state-changing endpoints — see M-17.

## 27. Technical Debt

- `PaymentNotFoundError` and `CheckoutInProgressError` are defined and never used anywhere (L-10) — dead typed errors that mislead readers into believing those cases are specially handled.
- `adapter.void()` and partial-capture support are fully implemented on the Stripe adapter and never invoked by the orchestration layer (see C-3) — a real capability sitting unused exactly where it's needed.
- Zone-containment geometry functions (`isPointInPolygonZone`, `isPointInRadiusZone`) are implemented, independently tested, and never called from the actual routing decision (C-12) — the clearest example in this codebase of tested code that doesn't do anything in production.
- Webhook signature-header selection (`stripe-signature` vs. a generic fallback) is hardcoded in the shared controller rather than living behind the per-adapter interface the registry pattern's own design intends (L-3) — will require editing shared code, not just adding an adapter, for the next real provider.
- The `:providerType` path segment on the webhook route is captured and never checked (L-2).
- The event bus (§24) is, in its entirety, currently technical debt in the sense that it represents designed-for architecture with no real consumers — not defective, but a maintenance/understanding cost until it's either wired up or explicitly scoped down.
- Currency is hardcoded to `"usd"` throughout the payment path (M-19) — a deliberate scope limitation that should be documented as such if it isn't already, to avoid a future surprise.

## 28. Bugs Found

Concrete, reproducible bugs (as opposed to missing features or design gaps), cross-referenced to their full write-up:

- Double-charge via cart re-checkout with no `cart.status` guard — C-5.
- Double-charge via idempotency-key retry after a partial post-payment failure — C-2 (triggered in practice by C-15).
- Authorized payment never voided on capture failure — C-3.
- Orphaned provider authorization on a `PaymentAttempt` DB-write failure — C-4.
- Refund failures recorded internally as `FAILED` but reported to the order/customer as success — C-7.
- Coupon redemption count check-then-act race allowing over-redemption past configured caps — C-8.
- `markPaidCash` can double-book cash revenue on retry/double-click — H-2.
- `nextOrderNumber` race producing an unhandled 500 instead of a clean retry under concurrent checkout — M-5.
- `getOrCreateActiveCart` check-then-create race producing duplicate active carts — M-6.
- Cumulative partial refunds that sum to 100% never flip `Order.status` to `REFUNDED` — M-3.
- Kitchen `maxConcurrentOrders` check-then-act race allowing the cap to be overshot under concurrent checkout — M-13.
- Delivery-rule fallback chain can bypass the busy-driver check entirely via a same-method or self-referencing fallback — H-9.
- QR `tableId` can be set directly by any client, bypassing the token-resolution step entirely — C-13.
- Cart/order identity ownership is never checked, enabling cross-account cart/order manipulation — C-14.

## 29. Edge Cases

- Process crash between order creation (committed) and payment resolution (not yet run) leaves an order permanently `PENDING_PAYMENT` with no automated recovery — L-4.
- Process crash between a durable `OrderEvent` DB write and the corresponding in-memory bus emission silently drops that event for any (future) subscriber — §24.
- A driver's app is backgrounded or closed at the exact moment an offer is created — the offer is invisible until the app is reopened and polls, with no timeout — C-10/C-11.
- Two browser tabs (or a double-tap) open before a guest-session cookie has round-tripped — creates two separate active carts for the same identity — M-6.
- Two concurrent checkout requests land within the same instant relative to a coupon's redemption cap, a restaurant's `maxConcurrentOrders` threshold, or a delivery rule's busy-driver limit — each of these independently "succeeds" past its intended cap — C-8, M-13, H-9.
- A client retries a checkout request using the same idempotency key after a transient failure that occurred *after* the payment had already succeeded — replays the entire checkout and charges twice — C-2.
- A restaurant and the application server are in different timezones — every order is evaluated against the wrong "is this restaurant open" answer, platform-wide, for that restaurant — M-16.
- A guest customer clears cookies (or simply checks out again) to bypass a "one redemption per customer" coupon limit — H-5 (see §32 for full detail — noted here as it did not receive its own numbered finding above but is a real, already-acknowledged-in-tests gap).

## 30. Critical Issues

**C-1 — No payment tokenization UI; card and wallet payments cannot succeed.**
*Description:* The customer checkout page offers Apple Pay, Google Pay, and all four major card brands as selectable payment methods, but never collects or sends a `methodToken` for any of them — there is no Stripe Elements, Payment Request Button, Apple Pay JS, or Google Pay API integration anywhere in the frontend codebase.
*Why it matters:* `checkout.service.ts` requires a `methodToken` for every non-cash method and immediately fails the order if it's absent. Every checkout attempt using anything other than cash fails unconditionally, despite a fully-implemented backend Stripe adapter. This is the single highest-impact gap in the audit — it blocks the entire paid-order commerce loop.
*Severity:* Critical.
*Recommendation:* Build a real client-side tokenization flow (Stripe Elements or Payment Element at minimum; Payment Request Button for Apple/Google Pay) before any other payment work is prioritized — nothing else in the payments story matters until customers can actually pay.

**C-2 — Idempotency-key "FAILED → retryable" semantics enable double-charge after a partial post-payment failure.**
*Description:* Only the payment authorize/capture block in `placeOrder` is wrapped in a try/catch. Steps that run immediately after — notably sending the order-confirmation notification — run outside that guard, even though they execute after the customer has already been charged. If any of those steps throws, the idempotency key is marked `FAILED`. The idempotency library explicitly treats a `FAILED` key as retryable on the next request.
*Why it matters:* The frontend intentionally preserves the same idempotency key across retries (only clearing it on success), so the natural, well-behaved client retry behavior replays the entire checkout — including a second real authorization and capture — for an order that already succeeded once.
*Severity:* Critical.
*Recommendation:* Restructure `placeOrder` so that the payment operation is the true last step protected by the idempotency guarantee, or explicitly mark the idempotency key as `COMPLETED` immediately after successful capture, before any subsequent side effect (notification, final fetch) runs — so a later failure in those side effects can never re-trigger payment.

**C-3 — Authorized payment is never voided when the subsequent capture fails.**
*Description:* If `authorizeOrderPayment` succeeds (funds held on the customer's card) but the immediately-following `captureOrderPayment` call throws, the code marks the order `FAILED` and stops. `adapter.void()` — fully implemented on the Stripe adapter — is never called anywhere in the orchestrator, checkout service, or order service.
*Why it matters:* The customer is left with a real, live authorization hold on their card that the application believes is simply "failed," with no reconciliation job to release or retry it. `Payment.status` stays `AUTHORIZED` forever, permanently inconsistent with `Order.status: FAILED`. This is a direct customer-funds-held-with-no-resolution scenario.
*Severity:* Critical.
*Recommendation:* Call `adapter.void()` in the capture-failure catch path, and add a reconciliation job that periodically checks for `AUTHORIZED` payments whose order is `FAILED`/stale and voids them.

**C-4 — Orphaned provider authorization if the `PaymentAttempt` database write fails.**
*Description:* The provider `authorize()` call can succeed before the corresponding `PaymentAttempt` row is written to the database. If that write throws, there is no record anywhere in the system of the resulting `providerPaymentIntentId`.
*Why it matters:* The webhook reconciliation path looks up incoming events by exactly that ID — with no local record, an incoming webhook for this authorization can never be matched, and the hold can never be reconciled or released through the normal flow.
*Severity:* Critical.
*Recommendation:* Write the `PaymentAttempt` row (in a `PENDING`/reserving state) *before* calling the provider, updating it with the result afterward, so a DB failure can never produce an untracked provider-side state change.

**C-5 — Double-order and double-charge via cart re-checkout.**
*Description:* `placeOrder` marks the cart `CONVERTED` as a side effect of successful order creation, but nothing checks `cart.status` before processing a checkout request in the first place.
*Why it matters:* A second `place-order` call against the same `cartId`, using a different idempotency key (a naive client retry, a second open tab, or a replay), creates a second `Order` and runs authorization/capture a second time — a real second charge against the customer's card for the same items. This is trivially reproducible, not a theoretical race.
*Severity:* Critical.
*Recommendation:* Check `cart.status === "ACTIVE"` at the start of `placeOrder` and reject with a clear error if the cart has already been converted, independent of and in addition to the idempotency-key mechanism.

**C-6 — 3D Secure / SCA challenges are treated as outright declines.**
*Description:* The Stripe adapter's `authorize()` only treats `requires_capture`/`succeeded` PaymentIntent statuses as success; any other status — including `requires_action`, Stripe's status for a 3DS/SCA challenge — falls into the generic failure branch.
*Why it matters:* 3DS is common for EU-issued cards and increasingly used for US cards under risk-based authentication. There is no `client_secret` returned to the frontend and no confirmation-completion endpoint, so any card that requires this step is unconditionally declined rather than challenged. Combined with C-1, this is a second, independent blocker to real card payments even once tokenization is built.
*Severity:* Critical.
*Recommendation:* Return the PaymentIntent's `client_secret` to the frontend on `requires_action`, add a completion endpoint/flow that confirms the PaymentIntent after the customer completes the challenge, and treat this as a distinct, non-final orchestrator outcome rather than a failure.

**C-7 — Refund failures are reported to customers and staff as successes.**
*Description:* `orchestrator.refundOrderPayment` correctly records `Refund.status: "FAILED"` when the provider rejects a refund, but does not throw — it returns the row regardless of success/failure. `orders.service.refundOrder` never inspects the returned status before flipping the order to `REFUNDED`/`PARTIALLY_REFUNDED` and sending the customer a "your refund has been issued" notification.
*Why it matters:* This is a direct false-financial-state bug. A customer whose refund was actually rejected by the provider (e.g., disputed charge, already-refunded, transient network error) is told they were refunded and has no reason to follow up; staff sees "REFUNDED" in the dashboard and has no reason to retry. This is the kind of bug that produces real customer harm and support/trust damage the first time it occurs in production.
*Severity:* Critical.
*Recommendation:* Have `refundOrderPayment` throw (or return a discriminated result the caller is forced to handle) on provider failure, and only transition `Order`/notify the customer on confirmed success.

**C-8 — Coupon redemption limits are enforced via a check-then-act race with no atomicity.**
*Description:* Coupon validation counts existing redemptions against `maxRedemptions`/`maxRedemptionsPerCustomer` outside any transaction or row lock; the actual redemption record is written later, in a separate transaction, at the end of `placeOrder`. No unique constraint on `CouponRedemption` prevents two concurrent orders from each passing validation and both redeeming.
*Why it matters:* Any real concurrent load near a coupon's cap — the exact scenario a "first 100 customers" promotion is designed to create — allows the discount to be oversubscribed past its intended limit, with direct revenue impact.
*Severity:* Critical.
*Recommendation:* Enforce the cap atomically, e.g. via a database-level check (a partial unique index combined with a pre-incremented counter column checked with `UPDATE ... WHERE count < max RETURNING`) rather than an application-level count-then-insert.

**C-9 — No busy-driver check before assignment; a driver can be double-booked.**
*Description:* `assignDriver` validates that the target user is staff at the restaurant but never checks whether that driver already holds another active (`OFFERED`/`ACCEPTED`/`EN_ROUTE`) assignment before creating a new one.
*Why it matters:* The same driver can be offered — and even have accepted — two or more overlapping deliveries simultaneously with no system awareness of the conflict, directly undermining the reliability of the dispatch system during real operation.
*Severity:* Critical.
*Recommendation:* Add a per-driver active-assignment check (analogous to the existing restaurant-wide `countActiveDriverAssignments`) inside `assignDriver`, and reject or warn on assigning an already-busy driver.

**C-10 — No notification mechanism exists for a new driver offer; the system is poll-only.**
*Description:* `assignDriver` never calls into the notifications module, despite push and SMS provider stubs already existing and being registered for exactly this purpose. The only way a driver learns of a new `OFFERED` assignment is by actively polling the "my assignments" endpoint.
*Why it matters:* If a driver's app is backgrounded or the browser tab is closed, an assigned delivery is completely invisible to them until they happen to reopen and poll — a real order can silently never reach a driver, with no fallback.
*Severity:* Critical.
*Recommendation:* Trigger a push/SMS notification (using the already-registered stub providers, or their real implementations once built) at the moment a `DriverAssignment` is created.

**C-11 — No timeout or automatic reassignment for an unanswered driver offer.**
*Description:* `DriverAssignment` has no expiry/TTL field, and there is no scheduled job anywhere in the codebase that scans for and acts on stale `OFFERED` assignments.
*Why it matters:* Combined with C-10, if a driver never responds (app closed, notification missed), the delivery hangs indefinitely with no automatic recovery and no staff alert that anything is wrong — an order can be "assigned" forever without ever actually moving.
*Severity:* Critical.
*Recommendation:* Add an `offerExpiresAt` field and a periodic job (or a delayed-queue mechanism) that reassigns or escalates to staff when an offer goes unanswered past a configurable window.

**C-12 — Delivery zone geometry (polygon and radius containment) is dead code in the actual routing decision.**
*Description:* `evaluateRouting` accepts a `deliveryZones` array, and the production caller fetches and passes real zone data into it, but the function body never references that parameter. The independently-implemented and independently-tested containment functions (`isPointInPolygonZone`, `isPointInRadiusZone`) are called only from their own unit tests. Eligibility is decided purely by straight-line distance against a rule's configured min/max distance band; `DeliveryRule.zoneId` is persisted and never read back.
*Why it matters:* This is a core, advertised feature — zone-based delivery routing — that silently does nothing. A restaurant owner who configures a polygon specifically to exclude an unreachable area gets zero enforcement of that shape; customers geographically unreachable but within the numeric distance band are accepted, and the "polygon zone" feature is functionally decorative.
*Severity:* Critical.
*Recommendation:* Wire the existing, tested containment functions into `evaluateRouting`'s actual decision path, gated on whether a rule specifies a `zoneId`, and add a test that exercises this path with real zone data (not an empty array, which is all current tests pass).

**C-13 — QR table binding can be forged directly, bypassing the token entirely.**
*Description:* Cart-creation and set-fulfillment endpoints accept a raw, client-supplied `tableId` with no verification that it belongs to the target restaurant, that the table is active, or that the request ever resolved a QR token in the first place.
*Why it matters:* The schema's own documentation states the QR token is "the sole authorization for which restaurant and table this order is attributed to" — the implementation directly contradicts this. Any client can bind an order to an arbitrary table UUID, including one belonging to an entirely different restaurant, without ever scanning a code. Table IDs are trivially obtainable (returned in plaintext by the resolve endpoint), so this isn't a theoretical gap — it's a full, practical bypass of the stated dine-in security model.
*Severity:* Critical.
*Recommendation:* Require that `tableId` only ever be set server-side, as a result of a successfully resolved QR-token lookup within the current request/session — never accepted as a raw client-supplied field on cart-creation or fulfillment-update payloads.

**C-14 — No ownership check on cart or order endpoints (IDOR).**
*Description:* Every cart-mutation endpoint resolves the cart purely by the `cartId` in the URL, with no check that it belongs to the caller's resolved customer/guest identity. The same gap extends to order placement — nothing verifies the caller's session against `cart.customerId` before creating an order attributed to that customer.
*Why it matters:* `cartId` is returned in plaintext on every API response and stored in `localStorage` with no binding to any session token. Anyone who obtains another user's `cartId` (referrer leak, shared device, logs, support tooling) can view, modify, or check out that user's cart — including placing an order attributed to the victim's account, potentially using the victim's saved delivery address, while paying with the attacker's own payment method. This is a genuine, practically-exploitable authorization bypass, not an edge case.
*Severity:* Critical.
*Recommendation:* Add an explicit ownership check to every cart-read/mutation handler and to order placement, comparing the resolved caller identity (customer JWT or guest-session cookie) against the cart's `customerId`/`guestSessionId` before allowing any operation.

**C-15 — Notification failure after payment capture surfaces as a 500 to an already-charged customer.**
*Description:* The order-confirmation notification is awaited, unguarded, immediately after a successful payment capture inside `placeOrder`. A failure at this point (e.g., a transient `NotificationLog` write failure) propagates as an unhandled exception through a checkout that has already succeeded.
*Why it matters:* This is the most likely real-world trigger for C-2's double-charge path — it's the concrete, plausible failure mode (a routine transient DB blip on a secondary write) that turns the idempotency-retry design flaw into an actual customer-facing double charge.
*Severity:* Critical.
*Recommendation:* Wrap post-payment side effects (notification sending, non-essential follow-up work) in their own error boundary that logs and continues rather than propagating, so a successful payment can never be turned into a client-visible failure by a downstream, non-critical step.

## 31. High Priority Issues

**H-2 — `markPaidCash` can double-book cash revenue.**
*Description:* Unlike every other order-lifecycle action, `markPaidCash` bypasses the shared state-machine transition helper, doesn't check the order's current `paymentStatus` before writing, and has no idempotency-key requirement on its route.
*Why it matters:* A double-click or retried request writes two separate `Transaction` rows for the same cash order, double-booking revenue in the accounting ledger.
*Severity:* High.
*Recommendation:* Route `markPaidCash` through the same `transition()` helper used elsewhere (checking `paymentStatus !== "PAID"` first), and add idempotency-key protection to its endpoint.

**H-3 — Raw provider error messages leak to the public checkout endpoint (card-testing oracle).**
*Description:* Stripe's raw decline message and code (`insufficient_funds`, `invalid_cvc`, `card_declined`, etc.) propagate unmodified through the orchestrator and checkout service to the public, unauthenticated `place-order` endpoint's JSON error response.
*Why it matters:* This gives an attacker probing the endpoint with stolen card numbers granular per-attempt signal distinguishing decline reasons — a textbook card-testing/carding enablement pattern — and separately leaks restaurant misconfiguration details (e.g., a malformed API key message) directly to end customers.
*Severity:* High.
*Recommendation:* Map provider-specific decline reasons to a small, generic, customer-safe set of messages ("payment declined, please try another method") at the API boundary, logging the raw provider detail server-side only.

**H-4 — No refund idempotency and no over-refund guard.**
*Description:* The refund endpoint has no idempotency-key requirement, despite the shared idempotency middleware's own code comment explicitly naming refund as a route that needs it. Nothing validates a requested refund amount against the remaining refundable balance before calling the provider.
*Why it matters:* A double-clicked "issue refund" button (or a retried request) can trigger two provider refund calls for the same amount, relying entirely on the provider's own guard against over-refunding rather than the application's.
*Severity:* High.
*Recommendation:* Add `requireIdempotencyKey` to the refund route, and validate the requested amount against `capturedAmountCents - refundedAmountCents` before calling the provider.

**H-5 — Guest coupon redemption limits are entirely unenforceable.**
*Description:* Per-customer redemption limits are only checked when a `customerId` is present. Guests have no stable identity passed into coupon validation, and a brand-new `GuestCustomer` row is created on every single guest order with no lookup-by-email reuse.
*Why it matters:* A guest can redeem a "one per customer" coupon an unlimited number of times simply by checking out repeatedly — this is confirmed as an already-acknowledged, already-tested gap in the existing test suite (the test explicitly documents that the per-customer check is skipped for guests), not something that slipped through unnoticed.
*Severity:* High.
*Recommendation:* Either require a verified identity (email, at minimum) for any checkout using a per-customer-limited coupon, or track guest redemptions by a durable identifier (e.g., a hashed email/phone) rather than skipping the check entirely.

**H-6 — No password reset or change mechanism for customer accounts.**
*Description:* Only register/login/refresh/logout/me are implemented for customer auth — there is no endpoint or flow for a customer to reset a forgotten password or change a known one.
*Why it matters:* A customer who forgets their password has no recovery path at all; combined with H-7, a compromised credential can never be remediated by the account owner.
*Severity:* High.
*Recommendation:* Implement a standard email-based password-reset flow (token generation, expiry, single-use) before customer accounts are relied upon for anything beyond convenience.

**H-7 — Customer refresh tokens have no server-side revocation and survive logout.**
*Description:* Customer refresh tokens are self-contained, 30-day JWTs with no backing database table (unlike staff auth's opaque, DB-tracked refresh tokens). Logout only clears the client's cookies; the token itself remains valid and mintable into new access tokens for its full lifetime from any device that captured it.
*Why it matters:* There is no way for an account owner (or the platform, in response to a suspected compromise) to invalidate a leaked or stolen refresh token short of rotating the platform-wide signing secret.
*Severity:* High.
*Recommendation:* Introduce a `CustomerRefreshToken` table mirroring the staff-auth pattern (opaque token, hashed storage, explicit revocation on logout/password-change), even if it's a smaller lift than the full staff-auth reuse-detection design.

**H-8 — Silent driver reassignment gives the original driver no notice.**
*Description:* Because driver assignment is an upsert keyed on `fulfillmentId`, reassigning a delivery to a different driver overwrites the same underlying record rather than creating a new one or explicitly notifying the prior driver.
*Why it matters:* A driver already `EN_ROUTE` to a pickup or delivery simply stops seeing the job on their next poll, with no "this was taken from you" signal — confusing and operationally risky in a live dispatch scenario.
*Severity:* High.
*Recommendation:* Explicitly notify the previously-assigned driver (via the same notification mechanism recommended for C-10) when a reassignment occurs, and consider preserving the prior assignment's history rather than silently overwriting it.

**H-9 — Delivery-rule fallback chains are not re-validated for busy state, and can be self-referencing.**
*Description:* When a primary `RESTAURANT_DRIVER` rule is blocked by the busy-driver check, its configured fallback rule is returned unconditionally without re-checking whether the fallback is also `RESTAURANT_DRIVER` and also over the concurrency limit. Fallback validation doesn't prevent a rule from naming itself as its own fallback.
*Why it matters:* A same-method (or self-referencing) fallback silently defeats the configured concurrency cap entirely — reachable through normal, if careless, owner configuration in the delivery-rules admin UI, with the consequence of restaurant-driver over-dispatch beyond the intended safety limit.
*Severity:* High.
*Recommendation:* Re-apply the busy check to the resolved fallback rule before returning it, and reject fallback-rule configuration that references the rule's own ID (directly or transitively).

**H-10 — The event bus has zero production subscribers today.**
*Description:* `commerceEventBus.on()` is called nowhere in production code — only in the bus's own unit test — despite every meaningful order-lifecycle transition emitting an event under the architectural premise that notification dispatch, timeline projection, and fraud evaluation subscribe to it.
*Why it matters:* All current event traffic is silently discarded. This is not itself a live bug (notifications are sent via direct calls instead), but it means the documented event-driven architecture doesn't actually exist yet, and anyone reading the emission call sites without checking for subscribers would reasonably but incorrectly assume it does.
*Severity:* High.
*Recommendation:* Either wire real subscribers onto the bus as Sprint 08 features are built, or explicitly document that the bus is currently aspirational infrastructure and scope its use accordingly until H-11 is addressed.

**H-11 — The event bus is in-memory only and not viable for a horizontally-scaled deployment.**
*Description:* The bus is a bare Node `EventEmitter` — process-local memory, no persistence, no shared broker.
*Why it matters:* In a multi-instance deployment, a handler registered in one process never fires for an event emitted by another; a process crash between the durable event-log write and the in-memory emit silently drops that event for any subscriber. This is the single biggest structural risk in the whole event/notification pipeline for whenever real subscribers are added.
*Severity:* High.
*Recommendation:* Before wiring durability-sensitive subscribers (fraud, loyalty, POS sync) onto this bus, replace or front it with a durable, shared mechanism (e.g., a Postgres-backed outbox table polled by a worker, or a real message queue) — this is materially cheaper to do now than after multiple consumers depend on current in-memory-only behavior.

**H-12 — Notification failures on staff-facing order transitions surface as a 500 after the status has already changed.**
*Description:* The same unguarded-await-after-state-change pattern found in checkout (C-15) exists on every staff-facing order-lifecycle action that sends a notification (mark ready, mark out for delivery, complete, refund).
*Why it matters:* A transient notification failure turns an already-successful, already-persisted status change into a 500 returned to staff, who may reasonably retry — only to have the retry fail against the state machine's own guard, since the transition already happened, compounding the confusing failure.
*Severity:* High.
*Recommendation:* Apply the same fix recommended for C-15 (isolate notification side effects from the primary request's success/failure) across all order-lifecycle actions, not just checkout.

**H-13 — The payment webhook endpoint has no rate limiter.**
*Description:* `paymentWebhookRouter` is mounted with no authentication (by design — providers can't present staff credentials) and no rate-limiting middleware, unlike every other public-facing mutating route in the commerce surface.
*Why it matters:* Each incoming POST triggers a real database lookup, an AES-GCM decryption of the stored webhook secret, and cryptographic signature verification before any rejection — an attacker can flood this endpoint with garbage requests to consume CPU and database connections with zero throttling in the way.
*Severity:* High.
*Recommendation:* Add a rate limiter to the webhook route, tuned generously enough not to reject legitimate burst traffic from a real provider, but tight enough to blunt naive flooding.

**H-14 — No rate limiting on any staff-auth-gated commerce router.**
*Description:* Payments, POS, coupons, staff-facing orders, delivery-rules, fulfillment, and menu-commerce routers have no rate-limiting middleware at all, unlike cart, checkout, customer-auth, and staff-auth routes, which all have one.
*Why it matters:* A compromised or leaked staff session/JWT has no throttle on sensitive actions like refund issuance, payment-provider connection, or POS sync — every other authenticated-but-sensitive surface in the app has this protection; these do not.
*Severity:* High.
*Recommendation:* Apply a consistent staff-auth rate limiter across all of these routers, matching the pattern already established elsewhere in the codebase.

## 32. Medium Priority Issues

**M-1 — No encryption key rotation or versioning for BYOP credentials.**
*Description:* The AES-256-GCM ciphertext format used for stored provider credentials and webhook secrets carries no key-ID or version marker.
*Why it matters:* Rotating `COMMERCE_ENCRYPTION_KEY` — an expected operational event over the platform's lifetime, not a hypothetical one — makes every previously-stored credential permanently undecryptable, forcing every connected restaurant to fully re-onboard every payment/fulfillment/POS provider connection.
*Severity:* Medium.
*Recommendation:* Prefix stored ciphertext with a key-version identifier and support decrypting under any previously-valid key while encrypting new writes under the current one, enabling a graceful rotation.

**M-2 — Encrypted credential ciphertext is returned in owner-facing API responses.**
*Description:* `listProviders`/`connectProvider` and their controllers return full Prisma `PaymentProvider` rows, including `credentialsEncrypted`/`webhookSecretEncrypted`, with no field selection before serialization.
*Why it matters:* Not plaintext exposure, but unnecessary transmission of encrypted financial credentials over the wire increases blast radius if the encryption key is ever compromised, and violates least-exposure practice.
*Severity:* Medium.
*Recommendation:* Select/omit these fields explicitly before serializing provider rows to any API response.

**M-3 — Cumulative partial refunds never flip `Order.status` to `REFUNDED`.**
*Description:* The full-refund check compares only the current refund request's amount against `order.totalCents`, ignoring any previously-refunded amount on the same order.
*Why it matters:* Two (or more) sequential partial refunds that together sum to 100% each independently evaluate as "not a full refund," leaving `Order.status` stuck away from `REFUNDED` even though the underlying `Payment.status` correctly reaches it via its own running total — a real, dashboard-facing data-integrity divergence.
*Severity:* Medium.
*Recommendation:* Compute "is this a full refund" against the cumulative refunded amount (including this request), not just the current request in isolation.

**M-4 — Refunding a cash order produces a raw 500 instead of a clean 4xx.**
*Description:* Attempting to refund a cash order (which has no `Payment` row) throws a raw, untyped `Error` rather than the typed `PaymentNotFoundError` that already exists in the codebase for exactly this case.
*Why it matters:* This is a routine, expected staff action (refunding a cash order is a normal support scenario), and it currently surfaces as an opaque server error instead of a clear, actionable message.
*Severity:* Medium.
*Recommendation:* Throw `PaymentNotFoundError` in this case and add it to the refund controller's typed-error catch chain, mapping it to a clean 4xx.

**M-5 — `nextOrderNumber` race produces an unhandled 500 under concurrent checkout.**
*Description:* Two concurrent `placeOrder` calls for the same restaurant can both read the same "next" order number under normal transaction isolation; the database's unique constraint correctly prevents an actual duplicate, but the losing transaction's constraint-violation error is unhandled and surfaces as a generic 500 with no retry.
*Why it matters:* This is plausible during any real rush-hour concurrency on a popular restaurant, and produces a confusing failure for a customer whose order otherwise would have succeeded on a simple retry.
*Severity:* Medium.
*Recommendation:* Catch the specific constraint-violation error around order-number allocation and retry the transaction automatically a small, bounded number of times before surfacing a failure.

**M-6 — `getOrCreateActiveCart` check-then-create race produces duplicate active carts.**
*Description:* No unique constraint exists on `(restaurantId, customerId/guestSessionId, status=ACTIVE)`; the lookup-then-create logic in `getOrCreateActiveCart` is not protected against two near-simultaneous calls for the same identity.
*Why it matters:* A double-tap on "start order," or two tabs open before a guest cookie has round-tripped, creates two separate active carts; subsequent item-adds split unpredictably between them depending on which `cartId` each client tab happens to have cached, and the customer's cart appears to silently lose items.
*Severity:* Medium.
*Recommendation:* Add the missing unique constraint and handle the resulting conflict by re-fetching the now-existing row, rather than relying on an unprotected check-then-create.

**M-7 — No guest-cart-to-customer merge on login.**
*Description:* No code path merges an existing guest-session cart into a customer identity at login or registration time.
*Why it matters:* A browsing session's in-progress cart is silently orphaned the moment the customer logs in — `getOrCreateActiveCart` looks up by the new `customerId`, finds nothing, and creates an empty cart, discarding the items the customer had already added as a guest.
*Severity:* Medium.
*Recommendation:* On successful login/registration, look up any `ACTIVE` cart matching the current guest-session cookie for the target restaurant and re-parent it to the newly authenticated customer instead of creating a fresh one.

**M-8 — No cart expiry/cleanup job; `expiresAt` is written and never enforced.**
*Description:* `Cart.expiresAt` is set once at creation time and never read back by any query or scheduled process. The `ABANDONED`/`EXPIRED` status enum values exist and are never assigned by any code path.
*Why it matters:* A cart is treated as "the active cart" for a given identity indefinitely, regardless of its stated TTL — combined with M-6, this contributes to a slow accumulation of stale/duplicate cart rows with no lifecycle management.
*Severity:* Medium.
*Recommendation:* Add a scheduled sweep that transitions stale `ACTIVE` carts past their `expiresAt` to `EXPIRED`, and have `getOrCreateActiveCart` filter on `expiresAt > now()` in addition to `status: "ACTIVE"`.

**M-9 — Tracked inventory (`quantityAvailable`) is never decremented on order placement.**
*Description:* `isItemOrderable` reads `quantityAvailable` for eligibility checks, but nothing in the checkout or order-service code path decrements it when an order is actually placed — it only ever changes via manual staff edits.
*Why it matters:* For menu items with `trackInventory: true`, this means tracked-stock limits provide no real oversell protection: two concurrent checkouts for the last unit of a limited item will both pass the eligibility check and both succeed.
*Severity:* Medium.
*Recommendation:* Decrement `quantityAvailable` atomically as part of the same transaction that creates the order (with a floor check to prevent going negative), rather than treating it as a purely informational/manually-managed field.

**M-10 — No guest-order-to-customer-account linking.**
*Description:* No code searches existing `GuestCustomer` records by email when a customer registers or logs in.
*Why it matters:* A guest who orders and later creates an account with the same email has zero order-history association between the two — `Order.guestCustomerId` and `Order.customerId` are mutually exclusive and never reconciled, which is a real customer-experience gap (order history genuinely matters to returning diners).
*Severity:* Medium.
*Recommendation:* On registration, optionally offer to link prior guest orders matching the registered email (with appropriate verification), or at minimum expose a "was this you?" reconciliation path.

**M-11 — `createFavorite` doesn't validate that the menu item belongs to the given restaurant.**
*Description:* The favorite-creation schema accepts arbitrary `restaurantId`/`menuItemId` pairs with no cross-check against the menu item's actual restaurant.
*Why it matters:* A mismatched pair silently corrupts any restaurant-scoped favorites query, since the data model assumes the pair is always consistent.
*Severity:* Medium.
*Recommendation:* Validate that the supplied `menuItemId`'s `restaurantId` matches the supplied `restaurantId` before creating the favorite.

**M-12 — Public order-tracking endpoint over-shares and has no rate limiter.**
*Description:* `GET /api/public/orders/:id` returns the complete `Order` row with no field selection — including internal notes, delivery instructions, and full fee breakdowns — and has no rate-limiting middleware, unlike the rest of the public commerce surface. It is also the sole "authorization" mechanism (possession of the UUID), rather than the order-number-plus-contact-verification scheme the code's own comments describe as the intended design.
*Why it matters:* Anyone who obtains an order ID (forwarded email, browser history on a shared device, a referrer leak) can view the complete internal order record indefinitely, with no throttle on scripted access.
*Severity:* Medium.
*Recommendation:* Select only the fields a public tracking widget actually needs, add a rate limiter matching the rest of the public commerce surface, and consider implementing the originally-intended order-number-plus-contact-verification scheme for genuine bearer-token-independent security.

**M-13 — Kitchen capacity's concurrent-order check is a check-then-act race.**
*Description:* The active-order count that feeds the `maxConcurrentOrders` auto-pause check is read outside any transaction or row lock, before the order-creation transaction runs.
*Why it matters:* Two checkout requests arriving simultaneously, right at the configured capacity threshold, will both read the same "not yet at capacity" count and both proceed — silently defeating the cap's purpose during exactly the high-concurrency conditions (a rush) it exists to protect against.
*Severity:* Medium.
*Recommendation:* Re-check the active-order count inside the same transaction that creates the order (or use a `SELECT ... FOR UPDATE`/advisory lock on the restaurant's kitchen-capacity row) to close the window between read and write.

**M-14 — Driver location staleness is never checked anywhere.**
*Description:* `currentLat`/`currentLng`/`lastLocationAt` are written on every location ping but never read back by any other code path — no comparison against "now" exists anywhere, and Smart Routing doesn't take driver position as an input at all.
*Why it matters:* If a driver's phone backgrounds or loses connectivity mid-delivery, the last-known position simply freezes with no expiry or alert. Low impact today because nothing downstream depends on freshness, but a real trust hazard for any future UI that displays "live" driver position without adding its own staleness check.
*Severity:* Medium.
*Recommendation:* When (not if) driver location is surfaced to staff or customers, gate its display on `lastLocationAt` being within a reasonable freshness window, and show an explicit "location may be out of date" state otherwise.

**M-15 — Active-driver-assignment count on the checkout hot path has no restaurant-scoped index.**
*Description:* `countActiveDriverAssignments` is called on every single checkout quote computation and performs a join-filtered count against `DriverAssignment`, which has no `restaurantId` column or index (only `driverId` is indexed).
*Why it matters:* This is a query on the hottest path in the entire commerce engine (every cart quote, every checkout) that will degrade as delivery-order volume grows, since it can't use an index scoped to the restaurant being queried.
*Severity:* Medium.
*Recommendation:* Add a denormalized `restaurantId` column (or an index through the `Fulfillment` join) to make this count restaurant-scoped and index-backed.

**M-16 — Restaurant open/closed evaluation uses the server's timezone, not the restaurant's.**
*Description:* `isRestaurantOpenAt` evaluates the current time in whatever timezone the application server process runs in; there is no `timezone` field anywhere on the `Restaurant` model.
*Why it matters:* This is the very first eligibility gate `evaluateRouting` checks. Any mismatch between the server's timezone and a given restaurant's actual timezone produces a platform-wide wrong answer to "is this restaurant open" for that restaurant, silently accepting or rejecting every order regardless of fulfillment type.
*Severity:* Medium.
*Recommendation:* Add a `timezone` field to `Restaurant` and evaluate hours against it explicitly, rather than relying on the server process's local time.

**M-17 — No CSRF token mechanism.**
*Description:* No CSRF protection exists anywhere in the application; the sole cross-site-request mitigation is `SameSite=lax` on all cookies (staff, customer, and guest).
*Why it matters:* `SameSite=lax` is a reasonable single layer of protection in modern browsers for most state-changing requests, but money-moving endpoints (checkout, refund, provider connection) currently have no defense-in-depth beyond it.
*Severity:* Medium.
*Recommendation:* Add a standard CSRF token (double-submit cookie or synchronizer token) for state-changing requests on the highest-value endpoints (checkout, refund, payment-provider management) as a second layer.

**M-18 — Missing compound index for combined order-status-and-source filtering.**
*Description:* `Order` has separate two-column indexes for `[restaurantId,status]` and `[restaurantId,source]`, but no compound index covering both filters applied together.
*Why it matters:* Low impact at current scale; a dashboard query filtering by both status and source simultaneously will use one index and filter the remainder in memory rather than using a fully-covering index.
*Severity:* Medium.
*Recommendation:* Add a compound index if/when combined status+source filtering becomes a common dashboard query pattern (worth monitoring rather than pre-emptively fixing today).

**M-19 — Currency is hardcoded to `"usd"` throughout the payment path.**
*Description:* `checkout.service.ts` hardcodes `currency: "usd"` when constructing the payment authorization request, with no per-restaurant or per-order currency configuration anywhere.
*Why it matters:* No immediate bug at current scale (a US-only launch), but a hard architectural ceiling that would require touching the checkout/payment core (not just adding configuration) if multi-currency support is ever needed.
*Severity:* Medium.
*Recommendation:* No immediate action required if the launch scope is confirmed US-only; otherwise, thread a restaurant-level currency setting through the checkout and payment-authorization path now rather than retrofitting it later.

## 33. Low Priority Issues

**L-2 — Webhook `:providerType` path segment is captured but never checked.**
*Description:* The webhook route captures a `providerType` path segment that the handler never reads or validates against the resolved provider; only the `?providerId=` query parameter and HMAC signature actually determine correctness.
*Why it matters:* Not exploitable today (correctness comes entirely from `providerId` + signature verification), but the code comment describing this as an implicit cross-check is misleading, and it's a trap for whoever wires up the second real payment provider.
*Severity:* Low.
*Recommendation:* Either remove the unused path segment or add the cross-check the comment already claims exists.

**L-3 — Webhook signature-header selection is hardcoded outside the adapter interface.**
*Description:* The choice of which HTTP header carries the provider's signature (`stripe-signature` vs. a generic fallback) lives in the shared webhook controller rather than behind the per-provider adapter interface that the rest of the registry pattern is built around.
*Why it matters:* Minor architecture inconsistency — adding a second real provider will require editing shared controller code, not just adding a new adapter class, which is exactly the kind of coupling the adapter/registry pattern elsewhere in the codebase was designed to avoid.
*Severity:* Low.
*Recommendation:* Move header selection behind the adapter interface (e.g., an adapter-provided `signatureHeaderName` or a `parseSignature(req)` method) for consistency with the rest of the pattern.

**L-4 — Stuck `PENDING_PAYMENT` orders have no automated recovery.**
*Description:* If the process crashes between order creation (committed) and payment resolution, the order remains permanently `PENDING_PAYMENT` with no timeout job to auto-fail or flag it.
*Why it matters:* Staff *can* manually resolve this (the state machine permits `PENDING_PAYMENT → CANCELLED`/`FAILED`), but nothing surfaces that such an order exists or needs attention — it would only be found by manual inspection.
*Severity:* Low.
*Recommendation:* Add a periodic sweep that flags (or auto-cancels, after a generous grace period) orders stuck in `PENDING_PAYMENT` beyond a reasonable threshold.

**L-5 — Cart item quantity has no upper bound.**
*Description:* Neither the add-item nor update-quantity validation schema caps the requested quantity.
*Why it matters:* Not a security hole (price is computed per-unit and the total would simply be very large and payable), but a missing sanity cap for abuse/UX reasons — an accidental or malicious extreme value produces a nonsensical cart/order.
*Severity:* Low.
*Recommendation:* Add a reasonable upper bound (e.g., 99) to the quantity validation schema.

**L-6 — Auth rate limiting is IP-keyed only, with no per-account lockout.**
*Description:* The customer-auth rate limiter throttles by IP address; there is no additional per-account throttle or lockout.
*Why it matters:* Credential stuffing distributed across many IPs isn't slowed by this layer alone — genuinely lower severity here because argon2id password hashing is already a reasonable secondary mitigation against successful brute force.
*Severity:* Low.
*Recommendation:* Consider adding a per-account attempt counter/lockout as a defense-in-depth layer if abuse is observed in practice; not urgent given the existing hashing mitigation.

**L-7 — Loyalty and gift-card models are confirmed fully unreferenced (informational, not a defect).**
*Description:* The `loyalty` module directory is empty, and a full-codebase search for `GiftCard`/`LoyaltyProgram`/`LoyaltyAccount`/`LoyaltyTransaction` finds no references outside the schema itself.
*Why it matters:* This is exactly what was specified — a future-reserved, schema-only placeholder with zero UI or checkout-path exposure. Recorded here for completeness and to explicitly confirm there is no half-built functionality risk, not because it represents a problem.
*Severity:* Low (informational).
*Recommendation:* None required; this is working as designed.

**L-8 — Several frontend mutation handlers fail silently with no error feedback.**
*Description:* Cart quantity/fulfillment/coupon-removal handlers and account address/favorite-deletion handlers have no try/catch around their API calls, unlike sibling handlers in the same files that do catch and surface errors.
*Why it matters:* A failed request (e.g., a concurrently-deleted resource, a transient 500) produces no visible feedback — the user has no indication anything went wrong, and the UI may appear to silently ignore their action.
*Severity:* Low.
*Recommendation:* Apply the same try/catch-and-surface-error pattern already used correctly elsewhere in the same files, consistently, across all mutation handlers.

**L-9 — No dashboard-level auth guard or redirect-on-401.**
*Description:* There is no shared layout-level auth check for the owner/staff dashboard; individual pages that fail to load data due to an expired session show a generic "failed to load" message rather than redirecting to login, unlike the customer-facing account page, which does this correctly.
*Why it matters:* Not a security issue (the API is the actual enforcement boundary), but a confusing UX rough edge for staff whose session has expired.
*Severity:* Low.
*Recommendation:* Add a shared dashboard layout/hook that checks for a 401 response and redirects to `/login`, matching the pattern already used correctly on the customer account page.

**L-10 — Dead typed errors (`PaymentNotFoundError`, `CheckoutInProgressError`) are defined and never used.**
*Description:* Both error classes are fully defined in their respective module's `errors.ts` file but are never thrown or caught anywhere in the codebase.
*Why it matters:* This misleads a reader into believing the corresponding real-world cases (refunding a cash order; a genuinely concurrent duplicate checkout) are specially handled with a clean error type, when in practice they fall through to generic error handling instead.
*Severity:* Low.
*Recommendation:* Either wire these into the code paths they were clearly intended for (see M-4 for `PaymentNotFoundError`), or remove them if they're confirmed obsolete.

**L-11 — Saved customer payment methods are never used at checkout.**
*Description:* `CustomerPaymentMethod` has complete CRUD support and a working data model, but nothing in the checkout or payment-orchestration code ever reads a saved payment method to populate the `methodToken` used for a new order.
*Why it matters:* This is currently inert, unchargeable data — a customer can "save" a card that can never actually be used to pay for anything through the current checkout flow.
*Severity:* Low.
*Recommendation:* Once C-1's tokenization UI work is underway, extend it to offer saved payment methods as a selectable option that populates `methodToken` from the stored `providerToken`.

## 34. Sprint 08 Recommendations

In priority order, reflecting what blocks real launch first and what becomes exponentially more expensive to fix the longer it's deferred:

1. **Build the client-side payment tokenization flow** (C-1) — nothing else in the payments story matters until a customer can actually complete a paid order. Include Payment Request Button coverage for Apple Pay/Google Pay in the same effort, since it's the natural extension of the same integration.
2. **Close the money-integrity loop** around payment failure handling: void-on-capture-failure (C-3), orphaned-authorization prevention (C-4), refund-status verification before declaring success (C-7), and a redesign of where the idempotency guarantee's boundary sits relative to post-payment side effects (C-2, C-15). Treat this as one coherent design problem — "what happens when a payment operation fails partway" — rather than four separate patches.
3. **Fix the two confirmed security-boundary bypasses**: cart/order identity ownership checks (C-14) and QR-token enforcement on table binding (C-13). These are the kind of finding that should block a launch on their own, independent of the payment work above.
4. **Give driver dispatch a real reliability mechanism**: notification on offer (C-10) and a timeout/reassignment path for unanswered offers (C-11), plus the busy-driver double-booking check (C-9). This is a fulfillment-reliability problem, not a nice-to-have, for any restaurant doing real delivery volume.
5. **Decide the event bus's real architecture** (H-10, H-11) before Sprint 08's other features (which will likely want to subscribe to order events for fraud/loyalty/analytics purposes) build on top of it — retrofitting durability after real subscribers exist is a much larger effort than building it in now.
6. **Wire the dead zone-geometry code into the actual routing decision** (C-12) — this is a small, contained fix (the tested functions already exist) with an outsized correctness payoff for any restaurant relying on polygon zones.
7. Address the coupon-redemption race (C-8) and the kitchen-capacity race (M-13) together, since both are the same class of check-then-act concurrency problem and likely share a similar fix pattern (atomic counter updates or row-level locking).
8. Round out account security: password reset (H-6) and refresh-token revocation (H-7) for customer accounts.
9. Add rate limiting to the two gaps that stand out most (webhook endpoint H-13, staff-auth-gated routers H-14) as a quick, low-risk hardening pass.
10. Everything in §32/§33 (Medium/Low) can reasonably be scheduled opportunistically alongside the above, prioritizing anything a code-reviewer would flag as "this is going to bite someone eventually" — the cart/inventory/timezone items in particular.

## 35. Final Verdict

Sprint 07 delivered a commerce engine with genuinely strong bones: clean module boundaries, a real centralized state machine, a real multi-provider payment orchestrator, correct webhook cryptography, and consistent tenant isolation, all backed by a substantial (663-test) suite that actually exercises the logic it claims to cover. That is real, non-trivial engineering work, and it shows.

It is not, in its current state, safe to process real paid customer orders, and it is not ready to be handed to a first paying restaurant beyond a narrow, closely-supervised, cash-only pilot. The gap between "architecturally sound" and "production ready" here is concentrated almost entirely in failure-path handling and identity-level authorization — two categories of work that are easy to defer during initial feature construction and expensive to retrofit once real traffic depends on the code behaving correctly under failure and concurrency, not just under the happy path a demo would exercise.

The recommended path forward is not a rewrite or a re-architecture — it's a focused stabilization pass (this document's namesake) that closes the specific, enumerated gaps above before Sprint 08 adds further surface area on top of a foundation that isn't yet load-bearing for money movement and identity security. Every finding in this report is concrete, reproducible, and independently verifiable against the current codebase — none of it is speculative.

No code was changed in the course of producing this report. Waiting for approval before any remediation work begins.
