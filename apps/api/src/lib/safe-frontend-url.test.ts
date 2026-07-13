import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_FRONTEND_URL = process.env.FRONTEND_URL;

afterEach(() => {
  if (ORIGINAL_FRONTEND_URL === undefined) delete process.env.FRONTEND_URL;
  else process.env.FRONTEND_URL = ORIGINAL_FRONTEND_URL;
  vi.resetModules();
});

async function withFrontendUrl<T>(value: string | undefined, fn: (fresh: typeof import("./safe-frontend-url")) => T): Promise<T> {
  if (value === undefined) delete process.env.FRONTEND_URL;
  else process.env.FRONTEND_URL = value;
  vi.resetModules();
  const fresh = await import("./safe-frontend-url.js");
  return fn(fresh);
}

describe("safeFrontendOrigin — §11/§12/§13/§19: the one place every customer-facing link's base host is sanitized", () => {
  it("defaults to http://localhost:3000 when FRONTEND_URL is unset (local dev)", async () => {
    await withFrontendUrl(undefined, (fresh) => {
      expect(fresh.safeFrontendOrigin()).toBe("http://localhost:3000");
    });
  });

  it("falls back to https://www.ordervora.com if FRONTEND_URL is the known-bad placeholder.example value", async () => {
    await withFrontendUrl("https://placeholder.example", (fresh) => {
      expect(fresh.safeFrontendOrigin()).toBe("https://www.ordervora.com");
    });
  });

  it("strips a trailing slash so no downstream `${origin}/path` can ever produce a double slash", async () => {
    await withFrontendUrl("https://www.ordervora.com/", (fresh) => {
      expect(fresh.safeFrontendOrigin()).toBe("https://www.ordervora.com");
    });
  });

  it("rejects sites.ordervora.example, vercel.app, and old Render frontend URLs", async () => {
    for (const bad of ["https://sites.ordervora.example", "https://ordervora-web.vercel.app", "https://ordervora-web.onrender.com"]) {
      await withFrontendUrl(bad, (fresh) => {
        expect(fresh.safeFrontendOrigin()).toBe("https://www.ordervora.com");
      });
    }
  });

  it("passes through a real, legitimate FRONTEND_URL unchanged (besides trailing-slash stripping)", async () => {
    await withFrontendUrl("https://www.ordervora.com", (fresh) => {
      expect(fresh.safeFrontendOrigin()).toBe("https://www.ordervora.com");
    });
  });
});

describe("isKnownBadHost", () => {
  it("flags every known-bad fragment", async () => {
    const { isKnownBadHost } = await import("./safe-frontend-url.js");
    expect(isKnownBadHost("placeholder.example")).toBe(true);
    expect(isKnownBadHost("sub.placeholder.example")).toBe(true);
    expect(isKnownBadHost("sites.ordervora.example")).toBe(true);
    expect(isKnownBadHost("ordervora-web.vercel.app")).toBe(true);
    expect(isKnownBadHost("ordervora-web.onrender.com")).toBe(true);
    expect(isKnownBadHost("www.ordervora.com")).toBe(false);
    expect(isKnownBadHost("trattoria-bella.ordervora.com")).toBe(false);
  });
});
