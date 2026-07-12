import { randomBytes } from "node:crypto";

/** PURE — high-entropy, URL-safe token embedded in the printed QR code's target URL. */
export function generateQrToken(): string {
  return randomBytes(24).toString("base64url");
}
