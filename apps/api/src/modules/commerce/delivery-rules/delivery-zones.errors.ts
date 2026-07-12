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
