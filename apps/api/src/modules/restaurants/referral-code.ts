import { randomBytes } from "node:crypto";

export function generateReferralCode(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}
