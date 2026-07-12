export class POSProviderNotImplementedError extends Error {
  constructor(providerType: string) {
    super(`POS provider "${providerType}" is not implemented yet`);
  }
}

export class POSProviderNotFoundError extends Error {
  constructor() {
    super("POS provider not found");
  }
}
