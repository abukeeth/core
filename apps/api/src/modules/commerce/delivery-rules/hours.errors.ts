/**
 * RestaurantHours has no domain-specific errors: `listHours`/`setHours`
 * operate on the caller's own tenant-scoped restaurantId only (never by a
 * client-supplied :id), and `setHours` uses replace-all-for-restaurant
 * semantics, so there is no "not found" case to guard against. This file
 * exists for structural parity with the other delivery-rules sub-modules.
 */
export {};
