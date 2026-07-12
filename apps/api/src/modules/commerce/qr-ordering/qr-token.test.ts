import { describe, expect, it } from "vitest";
import { generateQrToken } from "./qr-token";

describe("generateQrToken", () => {
  it("returns a non-empty base64url string", () => {
    const token = generateQrToken();
    expect(token.length).toBeGreaterThan(20);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("returns a different token on each call", () => {
    expect(generateQrToken()).not.toBe(generateQrToken());
  });
});
