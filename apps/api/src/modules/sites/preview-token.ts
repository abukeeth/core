import jwt from "jsonwebtoken";

const PREVIEW_TOKEN_TTL = "1h";

export interface PreviewTokenPayload {
  siteId: string;
  kind: "preview";
}

function requireSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error("Missing required environment variable: JWT_ACCESS_SECRET");
  }
  return secret;
}

/**
 * §18 Preview System — signed, expiring, site-scoped token. Reuses
 * JWT_ACCESS_SECRET (no new secret to manage) but a distinct payload shape
 * (`kind: "preview"`) so a preview token can never be mistaken for or
 * reused as an access token, and vice versa.
 */
export function signPreviewToken(siteId: string): string {
  const payload: PreviewTokenPayload = { siteId, kind: "preview" };
  return jwt.sign(payload, requireSecret(), { expiresIn: PREVIEW_TOKEN_TTL });
}

export function verifyPreviewToken(token: string): PreviewTokenPayload {
  const decoded = jwt.verify(token, requireSecret()) as Partial<PreviewTokenPayload>;
  if (decoded.kind !== "preview" || typeof decoded.siteId !== "string") {
    throw new Error("Not a valid preview token");
  }
  return { siteId: decoded.siteId, kind: "preview" };
}
