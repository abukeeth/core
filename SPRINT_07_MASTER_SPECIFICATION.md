# Sprint 07 Master Specification — Commerce & Fulfillment Engine

**Status: PLANNING ONLY — Revision 2.** No branch created, no code written, no repository changes made beyond this document. This revision extends the original spec per a follow-up architecture review, adding: full multi-provider BYOP, delivery radius/min-order/max-distance/fee rules, kitchen capacity management, service fees, an expanded driver-tracking schema, order source tracking, a POS Adapter architecture, a QR Ordering architecture, a future-ready Loyalty schema, and a new Future Reserved Architecture section. Everything from Revision 1 not called out below as changed remains intact.

This spec builds directly on the Sprint 06.5 audit findings (unindexed status columns, no pagination, no cascade deletes, no caching layer, single-instance-only storage/rate-limiting) and on the existing codebase conventions confirmed by inspection: the `routes → controller → service` layering with per-module `validation.ts`/`errors.ts`, the `getOwnRestaurantId` / 404-not-403 tenant-isolation pattern, the `ImportAdapter`-style registry-with-`implemented`-flag pattern proven twice already (Sprint 04 import sources), and the fire-and-forget controller-level event hook pattern proven in Sprint 06's `revalidatePublishedSite`.

One grounding fact worth stating up front: `SiteFacts.hasOnlineOrdering` already exists in the schema/types and every CTA in the public renderer already ranks "Order Now" as the top-priority action — but it is currently hardcoded `false` in `assemble.ts`, and every rendered CTA link points at `#primary-action`, a same-page anchor with nothing behind it. Sprint 07 is what makes that flag true and that link real.

---

## 1. Commerce Engine Architecture

New domain: `apps/api/src/modules/commerce/`, following the existing per-module layering, subdivided by responsibility rather than left flat (justified by size, same rationale as `sites/scoring/` and `sites/renderer/`):

- `commerce/cart/` — cart CRUD, item/modifier management
- `commerce/checkout/` — quote computation, fulfillment/payment eligibility, order placement orchestration
- `commerce/orders/` — order lifecycle, status transitions, staff-facing management
- `commerce/payments/` — `PaymentProviderAdapter` interface + `providers/` (stripe, clover, square, authorize-net, adyen, fiserv) + registry
- `commerce/fulfillment/` — `FulfillmentProviderAdapter` interface + `providers/` (pickup, restaurant-driver, uber-direct, doordash-drive, local-courier) + registry
- `commerce/delivery-rules/` — zone/rule/fee storage + the Smart Routing Engine
- `commerce/menu-commerce/` — variants, modifiers, inventory (extends, does not fork, the existing `menu` module's data)
- `commerce/coupons/`
- `commerce/customers/` — the new end-diner identity (Customer/GuestCustomer), separate from staff `User`
- `commerce/kitchen/` — **(new)** kitchen capacity/pause state, staff-facing order queue
- `commerce/pos/` — **(new)** `POSProviderAdapter` interface + `providers/` + registry
- `commerce/qr-ordering/` — **(new)** table/QR-token management, dine-in checkout entry point
- `commerce/loyalty/` — **(new)** schema-only future-ready module, no active endpoints in Sprint 07
- `commerce/events/` — the in-process event emitter and event catalog
- `commerce/notifications/` — channel-abstracted dispatch

**Dependency direction is strictly one-way and acyclic by design**, learning directly from the one architectural crack the 06.5 audit found in Sprint 06 (the menu→sites circular-import workaround): `checkout` depends on `cart`, `menu-commerce`, `delivery-rules`, `kitchen`, and `payments`; `orders` depends on `checkout`'s output only; `fulfillment` depends on `orders` and `delivery-rules`; `pos` and `qr-ordering` are alternate **order-source entry points** that funnel into the same `checkout`/`orders` core rather than duplicating it (see §17–18); `events`, `notifications`, `loyalty`, and the future `analytics` consumer are pure subscribers that nothing in the core flow imports back. No module in this domain will ever need to reach back into a module that depends on it — if that need arises, it's a signal the boundary is wrong, not a case for another controller-layer workaround.

**Core principles enforced structurally, not just by convention:**
- **Full BYOP** is enforced by construction and is now explicitly a *multi-provider* model, not a one-provider-per-restaurant model: a restaurant may hold several simultaneously `CONNECTED` `PaymentProvider` rows (e.g. Stripe **and** Square **and** Clover at once), each independently BYO — never a platform-wide payment account a restaurant is funneled into. See §4 for the full multi-provider orchestration design.
- **BYO-delivery** is enforced identically for `FulfillmentProvider`.
- **BYO-POS** is enforced identically for the new `POSProvider` — a restaurant's existing point-of-sale system is connected to, never replaced (§17).
- **Adapter-behind-interface** is enforced by construction for all four provider families now: nothing outside `payments/providers/*.ts`, `fulfillment/providers/*.ts`, or `pos/providers/*.ts` may reference a specific provider's SDK or API shape. Orchestration code only ever calls the interface.
- **Idempotency is a platform-wide requirement, not a per-endpoint choice**: every mutating commerce endpoint that can plausibly be double-submitted (place-order, refund, coupon-redeem) requires an `Idempotency-Key` header, checked against a dedicated dedupe table before the handler runs.
- **State machines, not booleans**: `Order.status`, `Order.paymentStatus`, `Order.fulfillmentStatus` are each enums with an explicit, centrally-enforced valid-transition table — no code outside one `order-state-machine.ts`-equivalent service function is permitted to write these columns directly, mirroring how error-mapping is already centralized per module today.
- **One order pipeline, many entry points**: website checkout, QR dine-in checkout, and POS-originated orders all converge on the same `orders` module and the same `OrderEvent`/state-machine core — only the *entry point* (§17, §18) and `Order.source` differ. This is the structural guarantee that adding new order sources later (marketplace, phone/voice — §20) never requires forking the commerce engine.

---

## 2. Database Design

Every model below follows the existing schema's conventions (UUID `id`, `createdAt`/`updatedAt` unless the model is genuinely immutable, explicit `@@index` on every FK/status/date column — directly addressing the indexing gap the 06.5 audit found in the current schema). Presented as field specifications, not literal Prisma syntax. **New or materially revised models in this revision are marked `[NEW]` / `[REVISED]`.**

### Identity & Addresses
- **Customer** — `id`, `email` (unique), `passwordHash?`, `name`, `phone?`. Separate identity from the existing staff `User`/`Role` model.
- **GuestCustomer** — `id`, `email`, `phone?`, `name`. No password, ever.
- **CustomerAddress** — `id`, `customerId`(FK), `label?`, `line1`, `line2?`, `city`, `state`, `postalCode`, `country`, `lat?`, `lng?` (geocoded once at save time, cached), `isDefault`. Index: `[customerId]`.
- **CustomerFavorite** — `id`, `customerId`(FK), `restaurantId`(FK), `menuItemId`(FK). Unique `[customerId, menuItemId]`.
- **CustomerPaymentMethod** — `id`, `customerId`(FK), `providerId`(FK → PaymentProvider), `providerToken`, `brand?`, `last4?`, `expMonth?`, `expYear?`, `isDefault`. Index: `[customerId]`. A saved card is scoped to the specific `PaymentProvider` it was tokenized under — not a platform-wide wallet.

### Cart & Checkout
- **Cart** — `id`, `restaurantId`(FK), `customerId?`(FK), `guestSessionId?`, `fulfillmentType` `[REVISED: now PICKUP|DELIVERY|DINE_IN]`, `status` (ACTIVE|CONVERTED|ABANDONED|EXPIRED), `scheduledFor?`, `deliveryAddressId?`(FK), `tableId?`(FK Table) `[NEW — only set for DINE_IN]`, `notes?`, `expiresAt`. Indexes: `[restaurantId, status]`, `[customerId]`, `[guestSessionId]`.
- **CartItem** — `id`, `cartId`(FK), `menuItemId`(FK), `variantId?`(FK), `quantity`, `unitPriceCents` (frozen at add-time), `modifiersSnapshot`(JSON), `notes?`. Index: `[cartId]`.

### Orders (the durable financial record)
- **Order** `[REVISED]` — `id`, `orderNumber`, `restaurantId`(FK), `customerId?`(FK), `guestCustomerId?`(FK), `cartId?`(FK), `fulfillmentType` (PICKUP|DELIVERY|DINE_IN), `source` (OrderSource enum — **`[NEW]`**, see §16), `tableId?`(FK Table — **`[NEW]`**, dine-in only), `status`, `paymentStatus`, `fulfillmentStatus`, `subtotalCents`, `taxCents`, `tipCents`, `deliveryFeeCents`, `serviceFeeCents` (**`[NEW]`**, see §7), `discountCents`, `totalCents`, `currency`, `scheduledFor?`, `deliveryAddressId?`(FK), `deliveryInstructions?`, `notes?`, `placedAt`, `confirmedAt?`, `readyAt?`, `completedAt?`, `cancelledAt?`, `cancellationReason?`. Indexes: `[restaurantId, status]`, `[restaurantId, createdAt]`, `[restaurantId, source]` (**`[NEW]`** — owner reporting by channel), `[customerId]`; unique `[restaurantId, orderNumber]`.
- **OrderItem** — unchanged from Revision 1: `id`, `orderId`(FK), `menuItemId`(FK), `nameSnapshot`, `variantNameSnapshot?`, `unitPriceCents`, `quantity`, `modifiersSnapshot`(JSON), `lineTotalCents`. Index: `[orderId]`. Frozen financial snapshot, deliberately divergent from the live-menu-render principle.
- **OrderEvent** — append-only. `id`, `orderId`(FK), `type`, `payload`(JSON), `actorType` (SYSTEM|STAFF|CUSTOMER|PROVIDER_WEBHOOK), `actorId?`, `createdAt`. Index: `[orderId, createdAt]`.
- **OrderTimeline** — `id`, `orderId`(FK), `milestone`, `occurredAt`. Index: `[orderId]`.

### Payments (Full Multi-Provider BYOP) `[REVISED]`
- **PaymentProvider** `[REVISED]` — a restaurant's connected merchant account. `id`, `restaurantId`(FK), `providerType` (STRIPE|CLOVER|SQUARE|AUTHORIZE_NET|ADYEN|FISERV), `displayName?` (**`[NEW]`** — owner-facing label, e.g. "Stripe — Cards", "Square — Backup", meaningful once multiple providers coexist), `status` (PENDING_CONNECTION|CONNECTED|DISCONNECTED|ERROR), `priority` (**`[NEW]`** — Int, used for provider-level failover ordering, see §4), `isDefault` (**`[NEW]`** — exactly one `CONNECTED` provider per restaurant may be default), `credentialsEncrypted`, `externalAccountId`, `webhookSecretEncrypted`, `implemented`, `connectedAt?`. Unique `[restaurantId, providerType]` (still prevents two simultaneous connections of the *same* provider type — a restaurant cannot connect two different Stripe accounts — but nothing prevents holding rows across multiple *different* types at once; a restaurant with Stripe + Square + Clover all `CONNECTED` simultaneously is the expected, supported shape, not an edge case). Index `[restaurantId, status]`.
- **PaymentMethod** — `id`, `restaurantId`(FK), `providerId`(FK — the *primary* provider routed for this method type), `methodType` (APPLE_PAY|GOOGLE_PAY|VISA|MASTERCARD|AMEX|DISCOVER|CASH_ON_DELIVERY|CASH_AT_PICKUP), `isEnabled`. Unique `[restaurantId, methodType]` — one active primary routing per method type; provider-level fallback (if the primary provider is unavailable) is resolved dynamically at authorization time by orchestration logic (§4), not by a second schema row, keeping the method-to-provider mapping simple to reason about while still supporting resilience.
- **PaymentAttempt** — `id`, `orderId`(FK), `providerId`(FK), `methodType`, `attemptNumber`, `status`, `providerPaymentIntentId`, `failureCode?`, `failureMessage?`, `amountCents`. Index: `[orderId]`. Because attempts can now legitimately span *different* `PaymentProvider`s for the same order (provider-level failover, §4), `attemptNumber` counts across all providers tried, not just retries within one.
- **Payment** — `id`, `orderId`(FK, unique), `providerId`(FK — the provider that ultimately succeeded), `successfulAttemptId?`(FK), `status`, `authorizedAmountCents`, `capturedAmountCents`, `refundedAmountCents`, `capturedAt?`.
- **Refund** — `id`, `paymentId`(FK), `orderId`(FK, denormalized), `amountCents`, `reason`, `status`, `providerRefundId`, `initiatedById?`.
- **Transaction** — append-only ledger. `id`, `orderId`(FK), `restaurantId`(FK, denormalized), `type` (CHARGE|REFUND|TIP|PLATFORM_FEE|SERVICE_FEE|ADJUSTMENT — `SERVICE_FEE` **`[NEW]`**), `amountCents` (signed), `providerTransactionId?`. Index: `[restaurantId, createdAt]`.
- **Tip** — `id`, `orderId`(FK, unique), `amountCents`, `percentage?`, `recipientType` (RESTAURANT_POOL|DRIVER).
- **Tax** — `id`, `restaurantId`(FK), `jurisdiction`, `rateBasisPoints`, `appliesTo` (FOOD|DELIVERY_FEE|ALL), `isActive`.
- **Coupon** — `id`, `restaurantId`(FK), `code`, `type` (PERCENTAGE|FIXED_AMOUNT|FREE_DELIVERY), `value`, `minOrderCents?`, `maxDiscountCents?`, `startsAt?`, `expiresAt?`, `maxRedemptions?`, `maxRedemptionsPerCustomer?`, `isActive`. Unique `[restaurantId, code]`.
- **CouponRedemption** — `id`, `couponId`(FK), `orderId`(FK, unique), `customerId?`(FK), `guestCustomerId?`(FK), `discountAppliedCents`.
- **GiftCard** / **GiftCardTransaction** — **explicitly reaffirmed schema-only in Sprint 07**, no checkout UI wiring, per the original decision and this revision's brief. `GiftCard`: `id`, `restaurantId`(FK), `code`(unique), `initialBalanceCents`, `currentBalanceCents`, `status` (ACTIVE|REDEEMED|EXPIRED|CANCELLED), `issuedToEmail?`, `expiresAt?`. `GiftCardTransaction` mirrors `Transaction`'s ledger pattern.

### Delivery Configuration & Fees `[NEW]`
- **DeliveryConfig** `[NEW]` — one row per restaurant. `id`, `restaurantId`(FK, unique), `isDeliveryEnabled`, `isPickupEnabled`, `isDineInEnabled`, `deliveryRadiusMiles?` (a simple single-radius fast path — a plain circle around the restaurant's geocoded location, used when a restaurant hasn't configured granular `DeliveryZone`/`DeliveryRule` rows; purely a display/eligibility convenience once zones exist, superseded by them), `maxDeliveryDistanceMiles` (**hard ceiling** — checked first by the Smart Routing Engine as a cheap early-exit, applies regardless of radius/zone mode), `minOrderCentsForDelivery` (default 0), `minOrderCentsForPickup?` (default 0, rarely used but supported for parity). Explains the relationship precisely: `deliveryRadiusMiles` is the *simple* mode; `DeliveryZone`/`DeliveryRule` are the *advanced* mode; `maxDeliveryDistanceMiles` is an absolute cap that applies under either mode.
- **DeliveryFeeRule** `[NEW]` — `id`, `restaurantId`(FK), `name?`, `minDistanceMiles?`, `maxDistanceMiles?`, `feeType` (FLAT|PER_MILE|PERCENTAGE_OF_SUBTOTAL), `feeValue` (Int — **dual-unit convention, called out explicitly to avoid ambiguity**: cents for `FLAT`/`PER_MILE`, basis points for `PERCENTAGE_OF_SUBTOTAL`), `priority`, `isActive`. Index `[restaurantId, priority]`. Evaluated in priority order by the Smart Routing Engine at quote time; `Order.deliveryFeeCents` is the frozen computed result.
- **ServiceFeeRule** `[NEW]` — `id`, `restaurantId`(FK), `name` (owner-facing, e.g. "Service Fee", shown as a labeled line item so it's never mistaken for a hidden markup), `feeType` (FLAT|PERCENTAGE_OF_SUBTOTAL), `feeValue` (same dual-unit convention as `DeliveryFeeRule`), `appliesTo` (ALL_ORDERS|DELIVERY_ONLY|PICKUP_ONLY|DINE_IN_ONLY), `isActive`. Index `[restaurantId]`. `Order.serviceFeeCents` is the frozen computed result, always itemized separately from tip and delivery fee — a service fee funds the restaurant's operations (e.g. processing-fee passthrough), never confused with a driver tip.

### Kitchen Capacity `[NEW]`
- **KitchenCapacity** `[NEW]` — one row per restaurant. `id`, `restaurantId`(FK, unique), `isAcceptingOrders` (manual staff/owner pause toggle — the "pause the kitchen" emergency control), `maxConcurrentOrders?` (nullable; if set, new orders auto-pause once the count of `CONFIRMED`/`PREPARING` orders reaches this), `avgPrepTimeMinutes?` (feeds estimated-ready/estimated-delivery calculations shown to customers), `updatedAt`. Read by the Smart Routing Engine's "kitchen busy?" check (§8), replacing the placeholder flag described in Revision 1 with a real, owner-configurable model.

### Fulfillment & Driver Tracking `[REVISED]`
- **Fulfillment** — `id`, `orderId`(FK, unique), `restaurantId`(FK), `method` (PICKUP|RESTAURANT_DRIVER|UBER_DIRECT|DOORDASH_DRIVE|LOCAL_COURIER), `status`, `estimatedReadyAt?`, `estimatedDeliveryAt?`, `actualPickedUpAt?`, `actualDeliveredAt?`, `providerId?`(FK), `externalDeliveryId?`.
- **FulfillmentProvider** — `id`, `restaurantId`(FK), `providerType` (UBER_DIRECT|DOORDASH_DRIVE|LOCAL_COURIER), `status`, `credentialsEncrypted`, `implemented`. Unique `[restaurantId, providerType]`. Same multi-provider-capable shape as `PaymentProvider`, though Sprint 07's stub providers make this less immediately relevant than payments.
- **DriverAssignment** — `id`, `fulfillmentId`(FK, unique), `driverId`(FK → `User`, role `RESTAURANT_STAFF`), `assignedAt`, `acceptedAt?`, `status` (OFFERED|ACCEPTED|DECLINED|EN_ROUTE|DELIVERED), `currentLat?`, `currentLng?` (denormalized **latest known position**, for fast reads without scanning history), `lastLocationAt?`.
- **DriverLocationPing** `[NEW]` — append-only tracking history, distinct from `DriverAssignment`'s denormalized "current position" fields (same current-state-vs-append-log split already proven by `OrderEvent`/`OrderTimeline`). `id`, `driverAssignmentId`(FK), `lat`, `lng`, `recordedAt`. Index `[driverAssignmentId, recordedAt]`. Populated by polling in Sprint 07 (consistent with §6's "polling only, no websockets" scope decision); the schema is push-ready for real-time updates later without a migration.
- **DeliveryZone** — `id`, `restaurantId`(FK), `name`, `geometry`(JSON), `isActive`.
- **DeliveryRule** — `id`, `restaurantId`(FK), `zoneId?`(FK), `minDistanceMiles?`, `maxDistanceMiles?`, `fulfillmentMethod`, `priority`, `fallbackToRuleId?`(self-relation), `isActive`. Index `[restaurantId, priority]`.

### Menu Commerce
- **MenuItemVariant** — `id`, `menuItemId`(FK), `name`, `priceDeltaCents`, `sortOrder`, `isDefault`.
- **ModifierGroup** — `id`, `restaurantId`(FK), `name`, `selectionType` (SINGLE|MULTIPLE), `isRequired`, `minSelections`, `maxSelections?`.
- **ModifierOption** — `id`, `modifierGroupId`(FK), `name`, `priceDeltaCents`, `isAvailable`, `sortOrder`.
- **MenuItemModifierGroup** — join table, unique `[menuItemId, modifierGroupId]`.
- **MenuItemInventory** — `id`, `menuItemId`(FK, unique), `trackInventory`, `quantityAvailable?`, `lowStockThreshold?`, `isTemporarilyOutOfStock`, `outOfStockUntil?`.

### QR Ordering `[NEW]`
- **Table** `[NEW]` — `id`, `restaurantId`(FK), `label` (e.g. "Table 12", "Patio 3"), `qrToken` (unique, opaque random token embedded in the generated QR code's target URL), `isActive`. Index `[restaurantId]`. See §18.

### POS Integration `[NEW]`
- **POSProvider** `[NEW]` — `id`, `restaurantId`(FK), `providerType` (SQUARE_POS|CLOVER_POS|TOAST|LIGHTSPEED|GENERIC), `status` (PENDING_CONNECTION|CONNECTED|DISCONNECTED|ERROR), `credentialsEncrypted`, `syncDirection` (MENU_IMPORT|ORDER_EXPORT|BIDIRECTIONAL), `implemented`, `connectedAt?`. Unique `[restaurantId, providerType]`. See §17.
- **POSSyncLog** `[NEW]` — `id`, `posProviderId`(FK), `direction` (MENU_IMPORT|ORDER_EXPORT), `status` (SUCCESS|PARTIAL|FAILED), `itemsSynced`, `errorMessage?`, `syncedAt`. Index `[posProviderId, syncedAt]`.

### Loyalty (Future-Ready, Schema-Only) `[NEW]`
- **LoyaltyProgram** `[NEW]` — `id`, `restaurantId`(FK, unique), `pointsPerDollarCents` (points earned per dollar spent), `redemptionRateCentsPerPoint` (value of one point when redeemed), `isActive`. See §19.
- **LoyaltyAccount** `[NEW]` — `id`, `customerId`(FK), `restaurantId`(FK), `pointsBalance` (default 0). Unique `[customerId, restaurantId]` — points are per-restaurant, not a platform-wide currency, for the same reason saved cards are per-restaurant-provider (each restaurant's loyalty program is its own).
- **LoyaltyTransaction** `[NEW]` — append-only. `id`, `loyaltyAccountId`(FK), `orderId?`(FK), `points` (signed), `type` (EARN|REDEEM|ADJUST|EXPIRE), `createdAt`. Index `[loyaltyAccountId, createdAt]`.
- **Explicitly schema-only in Sprint 07**: no points are earned or redeemed anywhere in the checkout flow; no UI surfaces a balance. The model exists purely so points can start accruing in a later sprint without a migration — same treatment as `GiftCard`.

### Supporting
- **NotificationLog** — `id`, `orderId?`(FK), `restaurantId?`(FK), `customerId?`(FK), `channel`, `type`, `status`, `providerMessageId?`, `error?`.
- **WebhookEvent** — `id`, `source`, `externalEventId`, `payload`(JSON), `signatureVerified`, `status`. Unique `[source, externalEventId]`.
- **IdempotencyKey** — `id`, `key`(unique), `restaurantId?`, `endpoint`, `responseSnapshot?`(JSON), `status`, `expiresAt`. Index `[expiresAt]`.
- **FraudSignal** — `id`, `orderId`(FK), `signalType`, `severity`, `details`(JSON), `resolvedAt?`, `resolvedById?`.

### Cascade behavior
Unchanged principle from Revision 1: `Cart`/`CartItem` cascade-delete with their parent (ephemeral, safe to lose); `Order`/`OrderItem`/`Payment`/`Transaction`/`OrderEvent` **must never cascade-delete** on `Restaurant` deletion — financial/legal records requiring `Restrict` plus an explicit archival/anonymization service (Sprint 09 hardening work, not blocking here). `DriverLocationPing`, `POSSyncLog`, and `LoyaltyTransaction` (all append-only logs) follow the same `Restrict`-not-`Cascade` treatment as `Transaction`/`OrderEvent`, for the same audit-trail-integrity reason.

---

## 3. Checkout Engine

Checkout is a stateless pipeline over an `ACTIVE` `Cart`:

1. **Fulfillment selection** — pickup, delivery, or **dine-in** `[REVISED — dine-in added]`. Delivery requires an address and triggers `DeliveryConfig`/`DeliveryZone`/`DeliveryRule` evaluation. Dine-in is entered exclusively via a scanned `Table` QR code (§18) and skips address/scheduling entirely.
2. **Scheduling** (ASAP vs. future time), validated against restaurant open hours (structured hours model, introduced in Sprint 07 as a checkout-scheduling prerequisite).
3. **Item review** — quantities/modifiers editable in place.
4. **Delivery instructions / order notes** — sanitized before storage, reusing the renderer's `escapeHtml` discipline.
5. **Coupon application** — validated against `Coupon` rules and `CouponRedemption` limits at quote time, re-validated at placement.
6. **Minimum order amount check** `[NEW]` — the quote step validates `Cart` subtotal against `DeliveryConfig.minOrderCentsForDelivery`/`minOrderCentsForPickup` for the selected fulfillment type; failing this blocks proceeding to payment with a clear "add $X more to your order" message, not a checkout-time surprise.
7. **Tip selection** — percentage presets + custom amount.
8. **Delivery fee computation** `[NEW]` — resolved via `DeliveryFeeRule` (§7) once distance is known.
9. **Service fee computation** `[NEW]` — resolved via `ServiceFeeRule` (§7) based on the order's fulfillment type.
10. **Tax calculation** — via the `Tax` rules engine.
11. **Quote lock** — a `CheckoutQuote` computed and returned but **not persisted**, short expiry enforced at placement.
12. **Payment method selection** — filtered to the intersection of enabled `PaymentMethod`s and what the Smart Routing Engine allows, now also considering which of the restaurant's (potentially several) `PaymentProvider`s is actually reachable (§4).
13. **Order placement** — one atomic transaction: re-validate the quote (price drift, coupon validity, minimum order amount, max distance), authorize payment (with provider-level failover if the primary is down), create `Order` (with `source` set — §16) + `OrderItem`s + `Fulfillment` + the initial `OrderEvent`; downstream effects fire asynchronously via the event system.

Gift card redemption and loyalty-point earn/redeem remain schema-ready but **not** Sprint 07 checkout steps.

---

## 4. Payment Orchestration Engine — Full Multi-Provider BYOP `[REVISED]`

**`PaymentProviderAdapter` interface** (unchanged shape): `authorize(orderId, amountCents, methodToken)`, `capture(paymentAttemptId, amountCents?)`, `void(paymentAttemptId)`, `refund(paymentId, amountCents, reason)`, `getStatus(providerPaymentIntentId)`, `verifyWebhookSignature(rawBody, signatureHeader, secret)`, `parseWebhookEvent(payload)`.

**Registry**, mirroring the `ImportAdapter` registry exactly: one map from `PaymentProviderType` to adapter, each declaring `implemented: boolean`. **Stripe ships `implemented: true`**; Clover, Square, Authorize.net, Adyen, and Fiserv are registered stub adapters (`implemented: false`).

**Multiple providers per restaurant — the core of this revision's BYOP expansion**: a restaurant is not limited to one connected processor. A restaurant can, for example, connect Stripe as its primary card processor and Square as a backup, or connect two providers because different `PaymentMethod`s route to different providers by owner preference. Concretely:

- Each `PaymentMethod` row names exactly one *primary* `PaymentProvider` via `providerId` — this keeps the common case (one provider handling everything) simple to configure and reason about.
- Each `PaymentProvider` carries a `priority` and an `isDefault` flag. **Provider-level failover** is orchestration logic, not a schema relationship: if the primary provider for a chosen `PaymentMethod` is not `CONNECTED` (disconnected, in `ERROR` status, or reports a hard outage during authorization), the orchestrator looks for another `CONNECTED` provider — ordered by `priority` — that supports the same method type, and retries the authorization against it, recording a new `PaymentAttempt` row against the fallback provider. If no fallback exists, the customer sees a clear "payment temporarily unavailable" message rather than a silent failure.
- This is deliberately **not** exposed as "restaurant picks a provider per order" — customers never choose a processor; they choose a payment method (card, Apple Pay, etc.), and provider routing/failover happens transparently underneath, exactly as it would with any real-world multi-acquirer setup.
- `CustomerPaymentMethod` tokens remain scoped to the specific provider they were created under (§2) — a saved card tokenized against Stripe cannot be silently replayed against Square if failover occurs; a failed saved-card charge on a down provider prompts the customer to re-enter payment details rather than attempting a cross-provider token reuse that would not work in practice.

**Authorize vs. capture, retry logic, webhook processing**: unchanged from Revision 1 — auth+capture together by default for immediate orders, auth-only-then-capture-on-confirmation as an optional scheduled-order mode; `PaymentAttempt` supports multiple tries (now potentially across providers, not just within one); every inbound webhook is written to `WebhookEvent` first, signature-verified before being trusted, deduplicated via `[source, externalEventId]` uniqueness, and processed asynchronously via a background job.

---

## 5. Payment Methods

Unchanged core design from Revision 1, now explicitly operating under multi-provider BYOP (§4):

- **Apple Pay, Google Pay, Visa, Mastercard, Amex, Discover, Cash on Delivery, Cash at Pickup** — all present as `PaymentMethodType` values (§2). Card networks are individually toggleable per restaurant preference (e.g. avoiding Amex's fees), with the caveat that the connected provider's own network support must be validated at authorization time, since most processors don't enforce network-level blocking natively.
- Apple Pay / Google Pay are wallet layers routed through whichever `PaymentProvider` is primary for that method type, via the provider's native payment-request integration.
- **Cash on Delivery / Cash at Pickup** bypass `PaymentProviderAdapter` entirely — `Order.paymentStatus` starts `UNPAID`, staff mark it `PAID` on delivery/pickup, and a `Transaction` row is still created for reconciliation even though no provider was involved.
- Restaurants enable/disable each method independently (`PaymentMethod.isEnabled`); method availability is further filtered by the Smart Routing Engine (§8) against fulfillment method (e.g. Cash on Delivery reasonably disabled for third-party driver fulfillment).

---

## 6. Fulfillment Engine

Unchanged from Revision 1: `FulfillmentProviderAdapter` interface, PICKUP and RESTAURANT_DRIVER implemented in Sprint 07, UBER_DIRECT/DOORDASH_DRIVE/LOCAL_COURIER registered stubs. Restaurant Drivers use a minimal mobile-responsive dashboard view for assigned deliveries; live position is now explicitly backed by `DriverLocationPing` history plus `DriverAssignment`'s denormalized current position (§2), populated via polling in Sprint 07 — websocket push remains out of scope here.

---

## 7. Delivery Rules Engine — Radius, Minimum Order, Maximum Distance, Fee Rules `[REVISED]`

`DeliveryRule` rows continue to implement mile-tiered routing as data (§ unchanged from Revision 1: priority order, `fallbackToRuleId` chains, busy-driver fallthrough). This revision adds the full set of restaurant-configurable delivery economics:

- **Delivery radius in miles** — `DeliveryConfig.deliveryRadiusMiles` is the simple, no-zones-configured default: a plain circle around the restaurant's geocoded address. A restaurant with no `DeliveryZone`/`DeliveryRule` rows delivers anywhere inside this radius; a restaurant with zones configured uses those instead, and the radius becomes a display-only "our delivery area" convenience shown on the public site.
- **Maximum delivery distance** — `DeliveryConfig.maxDeliveryDistanceMiles` is an **absolute ceiling**, independent of radius/zone mode. The Smart Routing Engine checks this first, before consulting zones or rules at all, as the cheapest possible early rejection for an address that's simply too far.
- **Minimum order amount** — `DeliveryConfig.minOrderCentsForDelivery` (and, for parity, an optional `minOrderCentsForPickup`) is enforced at the checkout quote step (§3), not silently at payment time — a customer under the minimum sees exactly how much more to add.
- **Delivery fee rules** — `DeliveryFeeRule` rows (§2), evaluated in priority order, support flat fees, per-mile fees, and percentage-of-subtotal fees, optionally banded by distance (e.g. $2.99 under 3 miles, $4.99 3–8 miles). The resolved fee becomes `Order.deliveryFeeCents`, frozen at quote/placement time like every other money field.

Because all of this is data (`DeliveryConfig` + `DeliveryFeeRule` + `DeliveryZone` + `DeliveryRule`), a restaurant can fully reconfigure its delivery economics from the owner dashboard without any code change — the same "architecture designed for future expansion without breaking existing code" principle already established for routing.

---

## 8. Smart Routing Engine `[REVISED]`

One decision function, evaluated at checkout-quote time and again at order-confirmation time. **Inputs, expanded this revision:**

1. **Maximum delivery distance** `[NEW — first check, cheapest early-exit]` — reject immediately if the geocoded delivery address exceeds `DeliveryConfig.maxDeliveryDistanceMiles`.
2. **Restaurant open/closed** — from the structured hours model.
3. **Kitchen capacity** `[REVISED — now a real model, not a placeholder flag]` — `KitchenCapacity.isAcceptingOrders` (manual pause) and, if `maxConcurrentOrders` is set, whether current `CONFIRMED`/`PREPARING` order count has reached it; either condition blocks new orders with a clear "kitchen is temporarily paused" message, never a silent failure.
4. **Driver availability** — busy-driver concurrency check (§7) plus external provider availability once real adapters exist.
5. **Delivery distance vs. radius/zones** — resolved against `DeliveryConfig.deliveryRadiusMiles` (simple mode) or `DeliveryZone`/`DeliveryRule` (advanced mode).
6. **Minimum order amount** — checked against `DeliveryConfig`, per fulfillment type.
7. **Delivery fee / service fee resolution** `[NEW]` — once a fulfillment method is selected, `DeliveryFeeRule` and `ServiceFeeRule` are evaluated to produce the fee figures shown in the quote.
8. **Payment method eligibility** — `PaymentMethod.isEnabled` AND at least one `CONNECTED` `PaymentProvider` reachable for it (now accounting for multi-provider failover, §4).
9. **Fulfillment method eligibility** — `DeliveryRule` resolution, or table validity for dine-in.

**Output**: an ordered, filtered set of valid `(fulfillmentMethod, availablePaymentMethods, feesApplied)` combinations — never a silent degrade; a hard block (closed, kitchen paused, too far) surfaces a specific, human-readable reason. This engine remains **deterministic and rule-based, not AI-driven** — correctly scoped, since money/logistics decisions must be exact and auditable, not probabilistic, unlike the content-generation pipeline's safe-default philosophy.

---

## 9. Menu Commerce

Unchanged from Revision 1. Variants, modifiers (required/optional via `ModifierGroup.isRequired`/min/maxSelections), extra pricing, inventory, and temporary-out-of-stock as specified in §2. Pricing freeze/re-validation rule unchanged: computed and frozen at add-to-cart time, re-validated (never silently recalculated) at checkout confirmation.

---

## 10. Order Lifecycle

Unchanged two-tier status modeling from Revision 1 (`Order.status`, `Order.paymentStatus`, `Order.fulfillmentStatus`, each with a centrally-enforced valid-transition table). **One addition**: `Order.source` (§16) and `Order.tableId` (dine-in only) are set once at creation and never change — they describe *how* the order entered the system, orthogonal to its lifecycle state.

---

## 11. Customer Experience

Unchanged from Revision 1: guest checkout by default, optional `Customer` accounts (separate identity from staff `User`), saved addresses/cards (per-restaurant-provider scoped), favorites, paginated order history, reorder (re-validated against current availability/pricing). Dine-in via QR (§18) supports both guest and logged-in customers identically to website checkout — no separate identity model for dine-in diners.

---

## 12. Event-Driven Architecture

Backbone unchanged (in-process emitter, post-commit emission, fire-and-forget subscribers, mirroring `revalidatePublishedSite`). **Event catalog additions this revision**: `KITCHEN_PAUSED`, `KITCHEN_RESUMED`, `KITCHEN_CAPACITY_REACHED`, `DRIVER_LOCATION_UPDATED`, `POS_SYNC_COMPLETED`, `POS_SYNC_FAILED`, `TABLE_ORDER_PLACED`. Full catalog (superset, including Revision 1's original list): `ORDER_CREATED`, `PAYMENT_AUTHORIZED`, `PAYMENT_CAPTURED`, `PAYMENT_FAILED`, `ORDER_CONFIRMED`, `KITCHEN_STARTED`, `ORDER_READY`, `DRIVER_ASSIGNED`, `DRIVER_EN_ROUTE`, `ORDER_PICKED_UP`, `ORDER_OUT_FOR_DELIVERY`, `ORDER_DELIVERED`, `ORDER_PICKED_UP_BY_CUSTOMER`, `ORDER_COMPLETED`, `ORDER_CANCELLED`, `REFUND_INITIATED`, `REFUND_ISSUED`, `COUPON_REDEEMED`, `FRAUD_SIGNAL_RAISED`, plus the additions above.

Still no external message broker in Sprint 07 (Redis/SQS remains a Sprint 09 scaling item), with the same swap-the-seam-later interface design.

---

## 13. Notification Architecture

Unchanged from Revision 1: `NotificationProviderAdapter` per channel, EMAIL implemented, SMS/Push registered stubs. Trigger list unchanged, still including the new-order staff alert. No new channels introduced by this revision's requirements.

---

## 14. Security

Unchanged core content from Revision 1 (fraud detection via `FraudSignal`, idempotency-key duplicate-order defense, mandatory webhook signature verification, `OrderEvent`+`Transaction` audit trail, role-based tenant-isolated permissions, PCI scope kept at SAQ-A via provider-side tokenization, envelope-encrypted provider credentials), plus:

- **POS credentials** (`POSProvider.credentialsEncrypted`) require the same envelope-encryption treatment as payment/fulfillment provider credentials — a leaked POS credential could expose a restaurant's full historical order/menu data in their POS system, not just future orders.
- **QR token security** — `Table.qrToken` must be a high-entropy random value (not a sequential or guessable table number), since it is the sole authorization for "which restaurant and table this order is attributed to." A guessed or enumerated token could let someone place an order attributed to the wrong table; tokens should be regenerable per-table by the owner if a QR code is lost, stolen, or printed incorrectly.
- **Order source is informational, not a trust boundary** — `Order.source` (POS, QR, website, etc.) records provenance for reporting purposes; it must never be used as an implicit authorization check in place of real tenant-scoping, to avoid a class of bug where a POS-sourced order accidentally skips normal validation.

---

## 15. Performance

Unchanged from Revision 1 (in-process TTL cache candidate for menu-commerce reads, `@@index` on every new model's hot columns, `GenerationJob`-style polled background jobs, pagination on all list endpoints). **One addition**: `DriverLocationPing` is a high-write-volume table by nature (frequent polling updates); it should be included explicitly in the Sprint 09 partitioning/retention conversation (old pings for completed deliveries have no long-term reporting value and are a strong candidate for a time-based cleanup job, unlike `OrderEvent`/`Transaction` which are permanent records).

---

## 16. Scalability & Order Source Tracking `[NEW]`

Scalability principles unchanged from Revision 1 (every hot commerce table carries `restaurantId` directly, `OrderEvent`/`Transaction` are partition candidates, `IdempotencyKey`/`WebhookEvent` dedupe must be Postgres-backed for correctness under multiple instances — restated, not weakened, by this revision).

**Order source tracking**, new in this revision: `Order.source` uses an `OrderSource` enum — `WEBSITE` (public-site checkout, the Sprint 07 default), `QR_DINE_IN` (§18), `POS` (an order rung up directly in the restaurant's existing POS system and synced in, §17), `PHONE` (staff manually keying in a phone order — uses the same staff-facing order-creation surface as POS-originated manual entry, no separate model needed), `MARKETPLACE` (reserved for §20, unused in Sprint 07), `MOBILE_APP` (reserved for §20, unused in Sprint 07). This is purely an attribution/reporting field — it powers the owner-facing "orders by channel" breakdown and is indexed (`[restaurantId, source]`) for that purpose — and, per §14, is never used as a trust or authorization signal.

---

## 17. POS Adapter Architecture `[NEW]`

A restaurant that already runs Square POS, Clover POS, Toast, or Lightspeed in-store should never be forced to abandon it to use OrderVora — this is the same BYOP philosophy extended to point-of-sale.

**`POSProviderAdapter` interface**: `importMenu()` → pulls the restaurant's current menu (items/categories/prices) from the POS system, mapped into OrderVora's `MenuItem`/`MenuCategory` shape (reusing, not duplicating, the exact mapping problem already solved by the Import Engine's adapters in Sprint 04/05 — conceptually a sixth import source, but live/ongoing rather than one-time); `exportOrder(order)` → pushes a completed OrderVora order into the POS system so it appears in the restaurant's existing reporting/kitchen-printer/inventory workflow; `getSyncStatus()`; `parseWebhookEvent(payload)` (for POS systems that push menu-change or order-status webhooks).

**Registry**, same `implemented`-flag pattern as payments/fulfillment: **all POS providers (Square POS, Clover POS, Toast, Lightspeed) are registered as stub adapters in Sprint 07** (`implemented: false`) — the interface, schema (`POSProvider`, `POSSyncLog`), and registry are built and proven now (satisfying "architecture must be designed for future expansion"), but no live POS integration ships this sprint. This is a deliberate, honest scope boundary, not a hidden gap: POS integrations vary enormously in API maturity and typically require per-provider partnership/certification, which is real work appropriately deferred rather than rushed.

**`syncDirection`** is modeled explicitly per connection (`MENU_IMPORT`, `ORDER_EXPORT`, or `BIDIRECTIONAL`) because not every restaurant wants both directions active — some want their POS to remain the single source of truth for the menu (import-only), others want OrderVora orders to flow into their POS for kitchen printing without touching the POS's menu data (export-only).

Every sync attempt writes a `POSSyncLog` row (§2), so partial/failed syncs are visible to the owner rather than silently stale.

---

## 18. QR Ordering Architecture `[NEW]`

**Table model** (§2): each physical table gets a `Table` row with a unique, high-entropy `qrToken`. The owner dashboard (§22) generates a printable QR code per table encoding a URL of the form `https://{platformDomain-or-customDomain}/order?table={qrToken}`.

**Flow**: a diner scans the code → lands on the restaurant's public site with `fulfillmentType` pre-set to `DINE_IN` and the `Cart` pre-associated with that `tableId` (resolved server-side from the token, never trusting a client-supplied table ID directly) → browses the same live menu the website already renders → adds items → checks out exactly like a pickup/delivery order, minus address/scheduling steps → the resulting `Order` carries `source: QR_DINE_IN` and `tableId` set.

**Kitchen-facing difference**: dine-in orders appear in the same kitchen/orders queue (§6, §22) as pickup/delivery orders, distinguished by fulfillment type and table label, so staff don't need a separate screen to see "table 12 wants X" — this reuses the one orders pipeline rather than building a parallel dine-in-only system, per §1's "one order pipeline, many entry points" principle.

**Explicitly out of scope for Sprint 07**: split-check/bill-splitting across multiple diners at one table, table-side "call the server" buttons, and any table-status board (occupied/available) beyond the QR-ordering flow itself — all reasonable dine-in features, but not required to make QR ordering functional, and better scoped once real usage patterns from Sprint 07's minimal version are known.

---

## 19. Loyalty & Gift Cards — Future-Ready Schema `[NEW]`

Both are schema-only in Sprint 07, deliberately, for the same reason: shipping a half-built rewards or stored-value feature (a balance customers can see but that behaves inconsistently, or that isn't fully reconciled against refunds/cancellations) is worse than shipping no feature at all.

- **Gift Cards** — schema unchanged from Revision 1 (`GiftCard`, `GiftCardTransaction`), reaffirmed schema-only per this revision's explicit instruction.
- **Loyalty** — new this revision: `LoyaltyProgram` (per-restaurant configuration: points-per-dollar, redemption rate, active flag), `LoyaltyAccount` (per-customer-per-restaurant balance — deliberately not a platform-wide points currency, matching the per-restaurant-provider pattern already established for saved cards), `LoyaltyTransaction` (append-only earn/redeem/adjust/expire ledger, mirroring `Transaction`'s audit-trail pattern). No checkout step earns or redeems points in Sprint 07; no dashboard surfaces a balance. Activating either system is scoped as future work once the core commerce engine has proven itself in production.

---

## 20. Future Reserved Architecture `[NEW]`

This section exists to make one thing explicit: **nothing in this specification blocks the following future capabilities**, and each is called out here specifically so the Sprint 07 build can be reviewed against "does this choice foreclose that option later?" without any of them being designed or built now.

- **Marketplace** (a platform-wide discovery surface listing multiple restaurants, vs. today's one-restaurant-per-site model) — `Order.source` already reserves `MARKETPLACE` as a value; the per-restaurant BYOP/BYO-delivery/BYO-POS model means a marketplace layer would need its own aggregation/settlement logic on top, but no restaurant-level data model needs to change to support restaurants also appearing in a future marketplace.
- **Franchise** (multi-location restaurant groups sharing a menu/brand but operating independent locations) — every commerce model is scoped to a single `restaurantId`; a franchise layer would sit *above* `Restaurant` as a new `RestaurantGroup`-style parent, not require restructuring `Order`/`Payment`/`Fulfillment`, which are correctly location-scoped already.
- **White-label** (reselling OrderVora under a partner's own brand) — the existing custom-domain support (Sprint 06) and per-restaurant BYOP/BYO-delivery model already avoid hardcoding "OrderVora" as a payment/delivery party anywhere in the money-movement path, which is the hard part of white-labeling; the remaining work would be presentation-layer (theming the dashboard itself), not commerce-schema work.
- **AI Phone Ordering** / **Voice Ordering** — both are simply new order-*sources*: a phone/voice system that ultimately constructs a `Cart` and calls the same `checkout`/`orders` pipeline as website or QR ordering, reported via a new `Order.source` value. The "one order pipeline, many entry points" principle (§1) is specifically what makes this addable later without touching `orders`, `payments`, or `fulfillment`.
- **Inventory** (formal stock management beyond per-item availability) — `MenuItemInventory` (§2) already models opt-in quantity tracking; a fuller inventory system (ingredient-level, supplier/purchasing) would extend this model rather than replace it.
- **CRM** (structured customer relationship/marketing tooling) — `Customer`, `CustomerAddress`, `Order` history, and `LoyaltyAccount` already form the data substrate a CRM layer would read from; no new customer-identity model would be needed, only new read-side tooling.
- **Mobile Apps** — `Order.source` already reserves `MOBILE_APP`; because the entire commerce engine is API-first (§17's API design section), a native app is a new API consumer, not a reason to change any backend module.

No schema, endpoint, or module in this specification should be read as a decision to build any of the above in Sprint 07 — this section is a review checklist for future-proofing, not a roadmap commitment.

---

## 21. API Design

**Public/customer-facing** (guest or `Customer` JWT):
`POST /api/public/restaurants/:id/cart` · `GET /api/public/cart/:cartId` · `POST /api/public/cart/:cartId/items` · `PATCH /api/public/cart/:cartId/items/:itemId` · `DELETE /api/public/cart/:cartId/items/:itemId` · `POST /api/public/cart/:cartId/coupon` · `DELETE /api/public/cart/:cartId/coupon` · `GET /api/public/checkout/:cartId/fulfillment-options` · `POST /api/public/checkout/:cartId/quote` · `POST /api/public/checkout/:cartId/place-order` (idempotency-key required) · `GET /api/public/orders/:orderId` · `GET /api/public/orders/:orderId/timeline` · `GET /api/public/tables/:qrToken` **`[NEW]`** (resolves a scanned QR token to its restaurant/table, used to bootstrap a dine-in cart)

**Customer account**: unchanged from Revision 1 — register/login/logout/refresh/me/orders(paginated)/reorder/addresses/payment-methods/favorites.

**Staff/owner order management** (tenant-scoped): unchanged core set (`GET/PATCH .../orders`, `.../orders/:id/confirm|start-preparing|mark-ready|complete|cancel|mark-paid`, `.../orders/:id/refund`, `.../fulfillment/:id/assign-driver|status`), plus `GET /api/restaurants/me/orders?source=` **`[NEW]`** (filter by order source for channel reporting).

**Menu commerce management**: unchanged from Revision 1 (variants, modifier groups/options, inventory, 86-toggle endpoints).

**Payments config**: `GET /api/restaurants/me/payment-providers` · `POST /api/restaurants/me/payment-providers/:type/connect` · `DELETE /api/restaurants/me/payment-providers/:type` · `PATCH /api/restaurants/me/payment-providers/:type/priority` **`[NEW]`** (reorder failover priority / set default) · `GET|PATCH /api/restaurants/me/payment-methods`

**Delivery & fees config** `[REVISED]`: `GET|PATCH /api/restaurants/me/delivery-config` **`[NEW]`** (radius, max distance, min order amounts, enable/disable per fulfillment type) · `GET|POST|PATCH|DELETE /api/restaurants/me/delivery-zones[/:id]` · `GET|POST|PATCH|DELETE /api/restaurants/me/delivery-rules[/:id]` · `GET|POST|PATCH|DELETE /api/restaurants/me/delivery-fee-rules[/:id]` **`[NEW]`** · `GET|POST|PATCH|DELETE /api/restaurants/me/service-fee-rules[/:id]` **`[NEW]`** · `GET|POST|PATCH|DELETE /api/restaurants/me/fulfillment-providers[/:type]`

**Kitchen** `[NEW]`: `GET|PATCH /api/restaurants/me/kitchen-capacity` (pause/resume, set max concurrent orders / avg prep time)

**POS** `[NEW]`: `GET /api/restaurants/me/pos-providers` · `POST /api/restaurants/me/pos-providers/:type/connect` · `DELETE /api/restaurants/me/pos-providers/:type` · `PATCH /api/restaurants/me/pos-providers/:type/sync-direction` · `POST /api/restaurants/me/pos-providers/:type/sync-now` · `GET /api/restaurants/me/pos-providers/:type/sync-log`

**QR Ordering / Tables** `[NEW]`: `GET|POST|PATCH|DELETE /api/restaurants/me/tables[/:id]` · `POST /api/restaurants/me/tables/:id/regenerate-qr-token`

**Coupons**: unchanged (`GET|POST|PATCH|DELETE /api/restaurants/me/coupons[/:id]`)

**Driver tracking** `[NEW]`: `POST /api/restaurants/me/fulfillment/:id/location-ping` (driver app writes its current position)

**Webhooks**: `POST /api/webhooks/payments/:providerType` · `POST /api/webhooks/fulfillment/:providerType` · `POST /api/webhooks/pos/:providerType` **`[NEW]`**

---

## 22. Frontend

**Customer-facing**: unchanged core set (interactive menu/ordering page, item customization modal, cart drawer, multi-step checkout, confirmation, order tracking, customer account), with checkout now branching on `DINE_IN` (no address/scheduling steps when entered via QR, §18) and the quote step surfacing minimum-order/delivery-fee/service-fee line items clearly.

**Owner-facing** (extends `/dashboard`): unchanged core set (orders inbox, order detail, menu commerce management, coupons), plus:
- `/dashboard/payments` — now a multi-provider list (connect/disconnect each, set priority/default) **`[REVISED]`**
- `/dashboard/delivery` — extended to include radius/max-distance/min-order settings and delivery-fee-rule + service-fee-rule editors, alongside the existing zones/rules editor **`[REVISED]`**
- `/dashboard/kitchen-capacity` **`[NEW]`** — pause/resume toggle, max-concurrent-orders and avg-prep-time settings
- `/dashboard/pos` **`[NEW]`** — POS provider connection (all shown as "coming soon" given Sprint 07's stub-only implementation, consistent with how DoorDash/UberEats/Grubhub are shown today) and sync log
- `/dashboard/tables` **`[NEW]`** — table list, QR code generation/download/print, regenerate-token action
- Minimal "today's orders/revenue, broken down by source" widget **`[REVISED]`** — now includes the channel breakdown enabled by `Order.source`

**Staff-facing**: minimal orders/kitchen queue (unchanged in spirit, now also displaying dine-in orders by table label) and driver view (assigned deliveries, mark picked up/delivered, now periodically posting a location ping per §21).

---

## 23. Testing Strategy

Unchanged core strategy from Revision 1 (vitest with fully-mocked collaborators for unit/integration, Playwright for the first genuine E2E coverage of guest checkout and owner order-management happy paths, release-blocking treatment for price-computation and payment-status-transition suites). **Additions for this revision's scope:**

- **Multi-provider failover unit tests**: primary provider `DISCONNECTED`/erroring correctly triggers fallback to the next-priority `CONNECTED` provider; no fallback available correctly surfaces a clear error rather than a silent failure.
- **Delivery economics unit tests**: `DeliveryFeeRule` and `ServiceFeeRule` resolution across flat/per-mile/percentage types and distance bands; `DeliveryConfig.maxDeliveryDistanceMiles` correctly short-circuits before zone/rule evaluation; minimum-order-amount enforcement blocks and unblocks correctly at the boundary.
- **Kitchen capacity unit tests**: manual pause blocks new orders regardless of `maxConcurrentOrders`; auto-pause triggers exactly at the configured concurrent-order threshold, not one-off.
- **QR ordering integration test**: scanning a `qrToken` correctly resolves to the right restaurant/table and produces a `DINE_IN`-sourced order; an invalid/deactivated token is rejected, not silently treated as pickup.
- **POS adapter interface-conformance tests**: the shared contract test suite (already planned for payment/fulfillment adapters in Revision 1) is extended to cover `POSProviderAdapter` stubs, so a future real POS integration is held to the same behavioral guarantees from day one.
- **Order source attribution tests**: every entry point (website, QR, staff-keyed phone order) produces the correct `Order.source` value, verified across the full placement flow, not just at the schema level.

---

## 24. Acceptance Criteria

All Revision 1 criteria remain in force (cart CRUD, quote accuracy, idempotent placement, Stripe authorize/capture/void/refund, webhook signature verification and dedup, routing across closed/busy/no-driver/out-of-range scenarios, cash-method handling, guest/customer checkout, tenant-isolated staff order actions, 86-toggle immediacy, atomic inventory decrement, centralized state-machine enforcement, complete `OrderEvent`/`OrderTimeline` trail, stub providers remaining visibly registered but unavailable, full verification suite, no regression to Sprints 01–06). **Additional criteria for this revision:**

- [ ] A restaurant can connect two or more `PaymentProvider`s simultaneously; disabling/disconnecting the primary provider for a payment method correctly triggers orchestration-level failover to the next-priority connected provider on the next authorization attempt.
- [ ] `DeliveryConfig.maxDeliveryDistanceMiles` rejects an out-of-range delivery address before any zone/rule evaluation runs.
- [ ] `DeliveryConfig.deliveryRadiusMiles` correctly governs delivery eligibility when no `DeliveryZone`/`DeliveryRule` rows exist for a restaurant, and is correctly superseded once they do.
- [ ] Orders below `minOrderCentsForDelivery`/`minOrderCentsForPickup` are blocked at the quote step with a specific "add $X more" message, not a generic error.
- [ ] `DeliveryFeeRule` and `ServiceFeeRule` resolve correctly across all three fee types (flat/per-mile/percentage) and are itemized as separate, correctly labeled line items on the order (never merged with tip).
- [ ] `KitchenCapacity.isAcceptingOrders = false` blocks new orders platform-wide for that restaurant with a clear message; `maxConcurrentOrders` auto-pauses and auto-resumes correctly as the in-flight order count crosses the threshold.
- [ ] `DriverAssignment.currentLat/Lng` reflects the most recent `DriverLocationPing`; historical pings are queryable per delivery for a full route reconstruction.
- [ ] Every order carries a correct `Order.source` value regardless of entry point (website, QR dine-in, staff-keyed phone); the owner orders list is filterable by source.
- [ ] A scanned `Table` QR token correctly bootstraps a `DINE_IN` cart scoped to the right restaurant and table; a deactivated or regenerated (stale) token is rejected.
- [ ] All registered `POSProvider` types remain visible-but-unavailable (`implemented: false`) in the owner dashboard without breaking existing adapter-registry tests; the `POSProviderAdapter` interface and `POSSyncLog` schema exist and pass interface-conformance tests against their stub implementations.
- [ ] `GiftCard`/`GiftCardTransaction` and `LoyaltyProgram`/`LoyaltyAccount`/`LoyaltyTransaction` exist in the schema and pass migration/validation, with zero UI surfaces or checkout steps referencing them.
- [ ] Full verification suite passes: `pnpm install`, `prisma generate`, `prisma validate`, `lint`, `typecheck`, `test`, `build`.

---

## Decisions Requiring Approval

1. **Stripe-first payment provider** (implemented), with Clover/Square/Authorize.net/Adyen/Fiserv as registered multi-provider-capable stubs. Confirm, or specify a different first provider.
2. **Minimal polling-based kitchen/orders view included in Sprint 07** (vs. deferring all staff-facing UI to Sprint 08's full KDS) — dine-in orders from QR ordering now also land in this same minimal view.
3. **In-process event emitter, no message broker, in Sprint 07** — Redis/SQS still deferred to Sprint 09.
4. **Gift cards and loyalty are both schema-only** in Sprint 07 — confirm this satisfies "future-ready" as intended for both.
5. **Structured hours model** introduced in Sprint 07 as a checkout-scheduling prerequisite (pulled forward from its original Sprint 10 slot).
6. **All POS providers (Square POS, Clover POS, Toast, Lightspeed) are stubs in Sprint 07** — no live POS sync ships this sprint; confirm this is acceptable, or identify one POS system to prioritize as "implemented: true" if a design partner needs it sooner (mirroring the Stripe-first payment decision).
7. **QR ordering ships without split-check/bill-splitting, call-server buttons, or a table-status board** — confirm this minimal scope (order placement only) is the right first slice.
8. **Multi-provider payment failover is automatic and transparent to the customer** (no "choose your processor" UI) — confirm this matches the intended restaurant/customer experience, versus, alternatively, exposing provider choice explicitly somewhere in the owner or customer flow.

---

Sprint 07 has not been started. Awaiting approval before any implementation begins.
