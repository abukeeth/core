/**
 * DeliveryConfig is a lazily-created singleton keyed on the caller's own
 * tenant-scoped restaurantId (see `getConfig`) — it never 404s, so there is
 * no domain-specific "not found" error here. This file exists for
 * structural parity with the other delivery-rules sub-modules.
 */
export {};
