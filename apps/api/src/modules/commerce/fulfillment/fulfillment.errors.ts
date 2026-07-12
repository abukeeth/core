export class FulfillmentProviderNotImplementedError extends Error {
  constructor(providerType: string) {
    super(`Fulfillment provider "${providerType}" is not implemented yet`);
  }
}

export class FulfillmentProviderNotFoundError extends Error {
  constructor() {
    super("Fulfillment provider not found");
  }
}

export class FulfillmentNotFoundError extends Error {
  constructor() {
    super("Fulfillment not found");
  }
}

export class DriverAssignmentNotFoundError extends Error {
  constructor() {
    super("Driver assignment not found");
  }
}

export class DriverNotOnStaffError extends Error {
  constructor() {
    super("Driver is not on this restaurant's staff");
  }
}

export class DriverAlreadyBusyError extends Error {
  constructor() {
    super("This driver already has an active delivery");
  }
}
