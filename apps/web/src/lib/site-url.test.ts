import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = process.env.NEXT_PUBLIC_SITE_URL;

afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_ENV;
  vi.resetModules();
});

async function withSiteUrl<T>(value: string | undefined, fn: (fresh: typeof import("./site-url")) => T): Promise<T> {
  if (value === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = value;
  vi.resetModules();
  const fresh = await import("./site-url.js");
  return fn(fresh);
}

describe("fallbackStorefrontUrl — §11/§12: never a placeholder domain, never a double slash", () => {
  it("defaults to https://www.ordervora.com/store/<slug> when NEXT_PUBLIC_SITE_URL is unset", async () => {
    await withSiteUrl(undefined, (fresh) => {
      expect(fresh.fallbackStorefrontUrl("trattoria-bella")).toBe("https://www.ordervora.com/store/trattoria-bella");
    });
  });

  it("falls back to the canonical host if NEXT_PUBLIC_SITE_URL is the known-bad placeholder.example value", async () => {
    await withSiteUrl("https://placeholder.example", (fresh) => {
      expect(fresh.fallbackStorefrontUrl("trattoria-bella")).toBe("https://www.ordervora.com/store/trattoria-bella");
    });
  });

  it("never produces a double slash from a trailing-slash NEXT_PUBLIC_SITE_URL", async () => {
    await withSiteUrl("https://placeholder.example/", (fresh) => {
      const url = fresh.fallbackStorefrontUrl("trattoria-bella");
      expect(url).not.toContain("//store/");
      expect(url).toBe("https://www.ordervora.com/store/trattoria-bella");
    });
  });

  it("strips a trailing slash from a real, legitimate NEXT_PUBLIC_SITE_URL too", async () => {
    await withSiteUrl("https://www.ordervora.com/", (fresh) => {
      expect(fresh.fallbackStorefrontUrl("trattoria-bella")).toBe("https://www.ordervora.com/store/trattoria-bella");
    });
  });

  it("never returns a vercel.app or sites.ordervora.example URL", async () => {
    for (const bad of ["https://ordervora-web.vercel.app", "https://sites.ordervora.example", "https://ordervora-web.onrender.com"]) {
      await withSiteUrl(bad, (fresh) => {
        expect(fresh.fallbackStorefrontUrl("trattoria-bella")).toBe("https://www.ordervora.com/store/trattoria-bella");
      });
    }
  });
});
