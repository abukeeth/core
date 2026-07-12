export class OrderNotFoundError extends Error {
  constructor() {
    super("Order not found");
  }
}

export class FraudSignalError extends Error {
  constructor(reason: string) {
    super(reason);
  }
}
