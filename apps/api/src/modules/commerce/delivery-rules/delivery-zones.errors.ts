export class DeliveryZoneNotFoundError extends Error {
  constructor() {
    super("Delivery zone not found");
  }
}

export class DeliveryRuleNotFoundError extends Error {
  constructor() {
    super("Delivery rule not found");
  }
}

export class InvalidFallbackRuleError extends Error {
  constructor() {
    super("Fallback rule must belong to the same restaurant");
  }
}

/**
 * Thrown when a delivery rule tries to route to a fulfillment method whose
 * provider isn't implemented yet (e.g. UBER_DIRECT / DOORDASH_DRIVE while their
 * adapters are stubs). Prevents an owner from silently stranding real delivery
 * orders on a method that has no working dispatch. Selectability is derived
 * from the fulfillment provider registry, so these methods re-enable
 * automatically once their adapters ship.
 */
export class FulfillmentMethodNotAvailableError extends Error {
  constructor(method: string) {
    super(`Fulfillment method "${method}" is not available yet`);
  }
}
