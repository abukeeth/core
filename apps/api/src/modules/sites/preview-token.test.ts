import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it } from "vitest";
import { signPreviewToken, verifyPreviewToken } from "./preview-token";

beforeEach(() => {
  process.env.JWT_ACCESS_SECRET = "test-secret-for-preview-tokens";
});

describe("signPreviewToken / verifyPreviewToken", () => {
  it("round-trips the siteId", () => {
    const token = signPreviewToken("site-1");
    expect(verifyPreviewToken(token).siteId).toBe("site-1");
  });

  it("rejects a token signed with a different secret", () => {
    const token = signPreviewToken("site-1");
    process.env.JWT_ACCESS_SECRET = "a-different-secret";
    expect(() => verifyPreviewToken(token)).toThrow();
  });

  it("rejects a tampered token", () => {
    const token = signPreviewToken("site-1");
    expect(() => verifyPreviewToken(`${token}tampered`)).toThrow();
  });

  it("rejects a regular access-token-shaped payload (different kind)", () => {
    const foreignToken = jwt.sign({ sub: "user-1", role: "RESTAURANT_OWNER" }, process.env.JWT_ACCESS_SECRET!, { expiresIn: "1h" });
    expect(() => verifyPreviewToken(foreignToken)).toThrow();
  });
});
