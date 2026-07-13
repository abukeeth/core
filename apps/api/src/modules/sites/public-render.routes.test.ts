import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    site: { findUnique: vi.fn() },
    siteVersion: { findUnique: vi.fn(), findFirst: vi.fn() },
    domain: { findFirst: vi.fn() },
  },
}));

vi.mock("../../lib/release-storage", () => ({
  releaseStorage: { savePage: vi.fn(), readPage: vi.fn(), saveAsset: vi.fn(), readAsset: vi.fn() },
}));

vi.mock("./renderer/render-site", () => ({ renderSitePage: vi.fn() }));
vi.mock("./site.service", () => ({ resolveSiteUrl: vi.fn().mockResolvedValue("https://example.com") }));

import { prisma } from "../../lib/prisma";
import { releaseStorage } from "../../lib/release-storage";
import { renderSitePage } from "./renderer/render-site";
import { signPreviewToken } from "./preview-token";
import { handlePreviewRequest, siteEdgeMiddleware, storeRouteHandler } from "./public-render.routes";
import { THEME_CATALOG } from "./theme-catalog";
import type { SiteDefinition } from "./types";

const mockPrisma = vi.mocked(prisma, { deep: true });
const mockReleaseStorage = vi.mocked(releaseStorage, { deep: true });
const mockRenderSitePage = vi.mocked(renderSitePage);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_ACCESS_SECRET = "test-secret";
  process.env.SITE_PLATFORM_DOMAIN = "sites.ordervora.example";
});

function mockRes() {
  // Real Express defaults to 200 when .send() is called without an explicit
  // .status() call first — mirror that here so success-path tests can assert
  // on it (§K: "internal preview routes return 200").
  const res: { statusCode?: number; body?: unknown; headers: Record<string, string> } & Record<string, unknown> = {
    statusCode: 200,
    headers: {},
  };
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.set = vi.fn((key: string, value: string) => {
    res.headers[key] = value;
    return res;
  });
  res.send = vi.fn((body: unknown) => {
    res.body = body;
    return res;
  });
  return res;
}

const theme = THEME_CATALOG.find((t) => t.key === "modern-bistro")!;

function definition(): SiteDefinition {
  return {
    schemaVersion: 1,
    restaurantName: "Trattoria Bella",
    tagline: "x",
    cuisine: "italian",
    businessType: "bistro",
    styleFamily: "MODERN",
    themeKey: theme.key,
    themeVersion: theme.version,
    colorSeed: theme.tokens.colorSeed,
    typography: theme.tokens.typography,
    facts: { restaurantName: "Trattoria Bella", hasOnlineOrdering: false, hasReservations: false },
    pages: [{ slug: "/", title: "Home", metaDescription: "x", sections: [{ type: "footer", props: {} }] }],
  };
}

describe("handlePreviewRequest", () => {
  it("rejects an invalid/tampered token with 401", async () => {
    const res = mockRes();
    await handlePreviewRequest({ params: { token: "garbage" }, query: {} } as never, res as never);
    expect(res.statusCode).toBe(401);
  });

  it("404s when the token is valid but the site no longer exists", async () => {
    mockPrisma.site.findUnique.mockResolvedValue(null);
    const token = signPreviewToken("site-1");
    const res = mockRes();

    await handlePreviewRequest({ params: { token }, query: {} } as never, res as never);

    expect(res.statusCode).toBe(404);
  });

  it("emits a detectable HTML error marker (not bare plain text) so the dashboard iframe can show a graceful state instead of raw content", async () => {
    const res = mockRes();
    await handlePreviewRequest({ params: { token: "garbage" }, query: {} } as never, res as never);

    expect(res.body).toContain('data-ordervora-preview-error="expired-token"');
    expect(res.headers["Content-Type"]).toContain("text/html");
  });

  it("marks a missing page distinctly from an expired token, so the dashboard can show a specific message", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", restaurantId: "r1", slug: "trattoria-bella" } as never);
    mockPrisma.siteVersion.findFirst.mockResolvedValue({ id: "draft-1", definition: definition() } as never);
    mockRenderSitePage.mockResolvedValue(null);
    const token = signPreviewToken("site-1");
    const res = mockRes();

    await handlePreviewRequest({ params: { token }, query: {} } as never, res as never);

    expect(res.statusCode).toBe(404);
    expect(res.body).toContain('data-ordervora-preview-error="page-not-found"');
  });

  it("renders the active DRAFT by default (no ?variation given)", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", restaurantId: "r1", slug: "trattoria-bella" } as never);
    mockPrisma.siteVersion.findFirst.mockResolvedValue({ id: "draft-1", definition: definition() } as never);
    mockRenderSitePage.mockResolvedValue("<html>preview</html>");
    const token = signPreviewToken("site-1");
    const res = mockRes();

    await handlePreviewRequest({ params: { token }, query: {} } as never, res as never);

    expect(mockPrisma.siteVersion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { siteId: "site-1", status: "DRAFT" } }),
    );
    expect(res.body).toBe("<html>preview</html>");
    expect(res.headers["X-Robots-Tag"]).toBe("noindex, nofollow");
    // §K: internal preview routes return 200 for a real, published preview.
    expect(res.statusCode).toBe(200);
  });

  it("renders a specific variation when ?variation=vid is given", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", restaurantId: "r1", slug: "trattoria-bella" } as never);
    mockPrisma.siteVersion.findFirst.mockResolvedValue({ id: "variation-2", definition: definition() } as never);
    mockRenderSitePage.mockResolvedValue("<html>variation</html>");
    const token = signPreviewToken("site-1");
    const res = mockRes();

    await handlePreviewRequest({ params: { token }, query: { variation: "variation-2" } } as never, res as never);

    expect(mockPrisma.siteVersion.findFirst).toHaveBeenCalledWith({ where: { id: "variation-2", siteId: "site-1" } });
    expect(res.body).toBe("<html>variation</html>");
  });

  it("always sets no-store cache headers (never publicly cached)", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", restaurantId: "r1", slug: "trattoria-bella" } as never);
    mockPrisma.siteVersion.findFirst.mockResolvedValue({ id: "draft-1", definition: definition() } as never);
    mockRenderSitePage.mockResolvedValue("<html>preview</html>");
    const token = signPreviewToken("site-1");
    const res = mockRes();

    await handlePreviewRequest({ params: { token }, query: {} } as never, res as never);

    expect(res.headers["Cache-Control"]).toBe("no-store");
  });
});

describe("siteEdgeMiddleware", () => {
  it("calls next() for a hostname that doesn't resolve to any site", async () => {
    mockPrisma.site.findUnique.mockResolvedValue(null);
    mockPrisma.domain.findFirst.mockResolvedValue(null);
    const next = vi.fn();
    const req = { hostname: "api.ordervora.example", path: "/" } as never;

    await siteEdgeMiddleware(req, mockRes() as never, next);

    expect(next).toHaveBeenCalled();
  });

  it("resolves a *.sites.ordervora.example hostname to a site by slug", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({
      id: "site-1",
      slug: "trattoria-bella",
      status: "PUBLISHED",
      publishedVersionId: "v1",
    } as never);
    mockReleaseStorage.readPage.mockResolvedValue("<html>home</html>");
    const res = mockRes();
    const req = { hostname: "trattoria-bella.sites.ordervora.example", path: "/" } as never;

    await siteEdgeMiddleware(req, res as never, vi.fn());

    expect(mockPrisma.site.findUnique).toHaveBeenCalledWith({ where: { slug: "trattoria-bella" } });
    expect(res.body).toBe("<html>home</html>");
  });

  it("resolves a custom domain via the Domain table when it's verified", async () => {
    mockPrisma.domain.findFirst.mockResolvedValue({ siteId: "site-1", hostname: "menu.example.com" } as never);
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", slug: "trattoria-bella", status: "PUBLISHED", publishedVersionId: "v1" } as never);
    mockReleaseStorage.readPage.mockResolvedValue("<html>home</html>");
    const req = { hostname: "menu.example.com", path: "/" } as never;

    await siteEdgeMiddleware(req, mockRes() as never, vi.fn());

    expect(mockPrisma.domain.findFirst).toHaveBeenCalledWith({ where: { hostname: "menu.example.com", verificationStatus: "VERIFIED" } });
  });

  it("serves a 503 holding page for an UNPUBLISHED site", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", slug: "trattoria-bella", status: "UNPUBLISHED" } as never);
    const res = mockRes();

    await siteEdgeMiddleware({ hostname: "trattoria-bella.sites.ordervora.example", path: "/" } as never, res as never, vi.fn());

    expect(res.statusCode).toBe(503);
    expect(res.body).toContain("temporarily unavailable");
  });

  it("404s a published-status site that has never actually been published (no publishedVersionId)", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", slug: "trattoria-bella", status: "DRAFT", publishedVersionId: null } as never);
    const res = mockRes();

    await siteEdgeMiddleware({ hostname: "trattoria-bella.sites.ordervora.example", path: "/" } as never, res as never, vi.fn());

    expect(res.statusCode).toBe(404);
  });

  it("404s a page slug with no matching static file", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", slug: "trattoria-bella", status: "PUBLISHED", publishedVersionId: "v1" } as never);
    mockReleaseStorage.readPage.mockResolvedValue(null);
    const res = mockRes();

    await siteEdgeMiddleware({ hostname: "trattoria-bella.sites.ordervora.example", path: "/nonexistent" } as never, res as never, vi.fn());

    expect(res.statusCode).toBe(404);
  });

  it("serves sitemap.xml with the right content type", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", slug: "trattoria-bella", status: "PUBLISHED", publishedVersionId: "v1" } as never);
    mockReleaseStorage.readAsset.mockResolvedValue("<urlset></urlset>");
    const res = mockRes();

    await siteEdgeMiddleware({ hostname: "trattoria-bella.sites.ordervora.example", path: "/sitemap.xml" } as never, res as never, vi.fn());

    expect(mockReleaseStorage.readAsset).toHaveBeenCalledWith("site-1", "v1", "sitemap.xml");
    expect(res.headers["Content-Type"]).toContain("application/xml");
  });
});

describe("storeRouteHandler (§M pre-wildcard-DNS fallback: /store/<slug>)", () => {
  it("404s an unknown slug — no fall-through concept for a path-based route", async () => {
    mockPrisma.site.findUnique.mockResolvedValue(null);
    const res = mockRes();

    await storeRouteHandler({ params: { slug: "no-such-restaurant" } } as never, res as never);

    expect(mockPrisma.site.findUnique).toHaveBeenCalledWith({ where: { slug: "no-such-restaurant" } });
    expect(res.statusCode).toBe(404);
  });

  it("serves the real published home page at /store/<slug>, identical to the hostname path", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", slug: "trattoria-bella", status: "PUBLISHED", publishedVersionId: "v1" } as never);
    mockReleaseStorage.readPage.mockResolvedValue("<html>home</html>");
    const res = mockRes();

    await storeRouteHandler({ params: { slug: "trattoria-bella" } } as never, res as never);

    expect(mockReleaseStorage.readPage).toHaveBeenCalledWith("site-1", "v1", "/");
    expect(res.body).toBe("<html>home</html>");
    // §K: internal preview routes return 200 for a real, published storefront.
    expect(res.statusCode).toBe(200);
  });

  it("resolves a nested sub-path from Express 5's *splat array, e.g. /store/<slug>/menu", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", slug: "trattoria-bella", status: "PUBLISHED", publishedVersionId: "v1" } as never);
    mockReleaseStorage.readPage.mockResolvedValue("<html>menu</html>");
    const res = mockRes();

    await storeRouteHandler({ params: { slug: "trattoria-bella", splat: ["menu"] } } as never, res as never);

    expect(mockReleaseStorage.readPage).toHaveBeenCalledWith("site-1", "v1", "/menu");
    expect(res.body).toBe("<html>menu</html>");
  });

  it("joins a multi-segment splat correctly, e.g. /store/<slug>/gallery/photo1", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", slug: "trattoria-bella", status: "PUBLISHED", publishedVersionId: "v1" } as never);
    mockReleaseStorage.readPage.mockResolvedValue("<html>photo</html>");
    const res = mockRes();

    await storeRouteHandler({ params: { slug: "trattoria-bella", splat: ["gallery", "photo1"] } } as never, res as never);

    expect(mockReleaseStorage.readPage).toHaveBeenCalledWith("site-1", "v1", "/gallery/photo1");
  });

  it("serves the same 503 holding page for an UNPUBLISHED site as the hostname path does", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", slug: "trattoria-bella", status: "UNPUBLISHED" } as never);
    const res = mockRes();

    await storeRouteHandler({ params: { slug: "trattoria-bella" } } as never, res as never);

    expect(res.statusCode).toBe(503);
    expect(res.body).toContain("temporarily unavailable");
  });

  it("404s a site that's never been published (no publishedVersionId), same as the hostname path", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", slug: "trattoria-bella", status: "DRAFT", publishedVersionId: null } as never);
    const res = mockRes();

    await storeRouteHandler({ params: { slug: "trattoria-bella" } } as never, res as never);

    expect(res.statusCode).toBe(404);
  });
});
