import { beforeEach, describe, expect, it } from "vitest";
import { generateCustomerRefreshToken, hashCustomerRefreshToken, signCustomerAccessToken, verifyCustomerAccessToken } from "./customer-jwt";

beforeEach(() => {
  process.env.JWT_ACCESS_SECRET = "test-secret-value-not-real";
  process.env.JWT_ACCESS_TTL = "15m";
});

describe("customer access tokens", () => {
  it("round-trips a customer id", () => {
    const token = signCustomerAccessToken("cust-1");
    expect(verifyCustomerAccessToken(token)).toBe("cust-1");
  });

  it("rejects an opaque refresh token presented as an access token", () => {
    const { token } = generateCustomerRefreshToken();
    expect(() => verifyCustomerAccessToken(token)).toThrow();
  });
});

describe("customer refresh tokens (Sprint 07.7 H-7)", () => {
  it("generates a high-entropy opaque token distinct from its hash", () => {
    const { token, tokenHash } = generateCustomerRefreshToken();
    expect(token).not.toBe(tokenHash);
    expect(token.length).toBeGreaterThanOrEqual(64);
  });

  it("hashes deterministically — the same raw token always hashes to the same value", () => {
    const { token, tokenHash } = generateCustomerRefreshToken();
    expect(hashCustomerRefreshToken(token)).toBe(tokenHash);
  });

  it("never stores the raw token as its own hash (the whole point of hashing before persistence)", () => {
    const { token, tokenHash } = generateCustomerRefreshToken();
    expect(hashCustomerRefreshToken(token)).not.toBe(token);
    expect(tokenHash).not.toBe(token);
  });

  it("sets an expiresAt roughly 30 days out", () => {
    const before = Date.now();
    const { expiresAt } = generateCustomerRefreshToken();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    expect(expiresAt.getTime()).toBeGreaterThan(before + thirtyDaysMs - 5000);
    expect(expiresAt.getTime()).toBeLessThan(before + thirtyDaysMs + 5000);
  });
});
