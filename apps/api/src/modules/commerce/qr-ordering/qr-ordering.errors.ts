export class TableNotFoundError extends Error {
  constructor() {
    super("Table not found");
  }
}

/**
 * Deliberately the same error/message for "token doesn't exist" and
 * "token resolves to an inactive table" — never leak which case it was,
 * to avoid enumeration.
 */
export class InvalidQrTokenError extends Error {
  constructor() {
    super("Invalid or expired QR code");
  }
}
