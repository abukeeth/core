export class DeliveryFeeRuleNotFoundError extends Error {
  constructor() {
    super("Delivery fee rule not found");
  }
}

export class ServiceFeeRuleNotFoundError extends Error {
  constructor() {
    super("Service fee rule not found");
  }
}
