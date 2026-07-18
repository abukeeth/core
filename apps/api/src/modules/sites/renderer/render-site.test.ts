import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/prisma", () => ({
  prisma: { siteAsset: { findMany: vi.fn() }, menuItem: { findMany: vi.fn() }, deliveryConfig: { findUnique: vi.fn() } },
}));

vi.mock("../../menu/menu.service", () => ({ listCategories: vi.fn() }));
vi.mock("../../commerce/analytics/analytics.service", () => ({ getTopItems: vi.fn() }));
vi.mock("../../commerce/coupons/coupons.service", () => ({ listActiveCoupons: vi.fn() }));
vi.mock("../../commerce/loyalty/loyalty.service", () => ({ getProgram: vi.fn() }));
vi.mock("../../commerce/reviews/reviews.service", () => ({ listRestaurantReviews: vi.fn() }));

import { prisma } from "../../../lib/prisma";
import { getTopItems } from "../../commerce/analytics/analytics.service";
import { listActiveCoupons } from "../../commerce/coupons/coupons.service";
import { getProgram } from "../../commerce/loyalty/loyalty.service";
import { listRestaurantReviews } from "../../commerce/reviews/reviews.service";
import { listCategories } from "../../menu/menu.service";
import { renderAllPages, renderSitePage, resolveLiveMenu, resolveRenderAssets } from "./render-site";
import { THEME_CATALOG } from "../theme-catalog";
import type { SiteDefinition } from "../types";

const mockPrisma = vi.mocked(prisma, { deep: true });
const mockListCategories = vi.mocked(listCategories);
const mockGetTopItems = vi.mocked(getTopItems);
const mockListActiveCoupons = vi.mocked(listActiveCoupons);
const mockGetProgram = vi.mocked(getProgram);
const mockListRestaurantReviews = vi.mocked(listRestaurantReviews);

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
    pages: [
      { slug: "/", title: "Home", metaDescription: "x", sections: [{ type: "footer", props: {} }] },
      { slug: "/menu", title: "Menu", metaDescription: "x", sections: [{ type: "menu", props: {} }] },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListCategories.mockResolvedValue([]);
  mockPrisma.siteAsset.findMany.mockResolvedValue([]);
  mockPrisma.menuItem.findMany.mockResolvedValue([]);
  mockGetTopItems.mockResolvedValue([]);
  mockListActiveCoupons.mockResolvedValue([]);
  mockGetProgram.mockResolvedValue(null);
  mockPrisma.deliveryConfig.findUnique.mockResolvedValue(null);
  mockListRestaurantReviews.mockResolvedValue([]);
});

describe("resolveLiveMenu", () => {
  it("maps categories/items from menu.service into the renderer's shape", async () => {
    mockListCategories.mockResolvedValue([
      { id: "c1", restaurantId: "r1", name: "Mains", sortOrder: 0, createdAt: new Date(), updatedAt: new Date(), items: [
        { id: "i1", restaurantId: "r1", categoryId: "c1", name: "Spaghetti", description: null, priceCents: 1500, isAvailable: true, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() },
      ] },
    ] as never);

    const result = await resolveLiveMenu("r1");
    expect(result).toEqual([{ name: "Mains", items: [{ name: "Spaghetti", description: undefined, priceCents: 1500, isAvailable: true }] }]);
  });

  it("§Website Builder: resolves category/item imageKey to a real URL via the same assetUrl() seam as site assets", async () => {
    mockListCategories.mockResolvedValue([
      {
        id: "c1",
        restaurantId: "r1",
        name: "Mains",
        sortOrder: 0,
        imageKey: "/uploads/category.png",
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [
          {
            id: "i1",
            restaurantId: "r1",
            categoryId: "c1",
            name: "Spaghetti",
            description: null,
            priceCents: 1500,
            isAvailable: true,
            sortOrder: 0,
            imageKey: "/uploads/item.png",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      },
    ] as never);

    const result = await resolveLiveMenu("r1");
    expect(result[0].imageUrl).toBe("/assets/category.png");
    expect(result[0].items[0].imageUrl).toBe("/assets/item.png");
  });

  it("leaves imageUrl undefined for categories/items with no uploaded photo", async () => {
    mockListCategories.mockResolvedValue([
      {
        id: "c1",
        restaurantId: "r1",
        name: "Mains",
        sortOrder: 0,
        imageKey: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [
          {
            id: "i1",
            restaurantId: "r1",
            categoryId: "c1",
            name: "Spaghetti",
            description: null,
            priceCents: 1500,
            isAvailable: true,
            sortOrder: 0,
            imageKey: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      },
    ] as never);

    const result = await resolveLiveMenu("r1");
    expect(result[0].imageUrl).toBeUndefined();
    expect(result[0].items[0].imageUrl).toBeUndefined();
  });
});

describe("resolveRenderAssets", () => {
  it("picks the first HERO asset and all GALLERY assets", async () => {
    mockPrisma.siteAsset.findMany.mockResolvedValue([
      { kind: "HERO", storageKey: "/uploads/hero.png", altText: "Hero" },
      { kind: "GALLERY", storageKey: "/uploads/g1.png", altText: "G1" },
      { kind: "GALLERY", storageKey: "/uploads/g2.png", altText: null },
      { kind: "LOGO", storageKey: "/uploads/logo.png", altText: null },
    ] as never);

    const assets = await resolveRenderAssets("site-1");
    expect(assets.heroUrl).toBe("/assets/hero.png");
    expect(assets.heroAlt).toBe("Hero");
    expect(assets.galleryImages).toEqual([
      { url: "/assets/g1.png", alt: "G1" },
      { url: "/assets/g2.png", alt: "" },
    ]);
    expect(assets.logoUrl).toBe("/assets/logo.png");
  });

  it("returns undefined hero/logo and an empty gallery when there are no assets", async () => {
    const assets = await resolveRenderAssets("site-1");
    expect(assets).toEqual({ heroUrl: undefined, heroAlt: undefined, galleryImages: [], logoUrl: undefined });
  });

  it("(Production Hardening Phase 8) prefers the responsive rendition over the full-resolution original when present", async () => {
    mockPrisma.siteAsset.findMany.mockResolvedValue([
      {
        kind: "HERO",
        storageKey: "/uploads/hero-original.png",
        altText: "Hero",
        renditions: { thumbnail: "uploads/hero-thumb.webp", card: "uploads/hero-card.webp", full: "uploads/hero-full.webp" },
      },
      {
        kind: "GALLERY",
        storageKey: "/uploads/g1-original.png",
        altText: "G1",
        renditions: { thumbnail: "uploads/g1-thumb.webp", card: "uploads/g1-card.webp", full: "uploads/g1-full.webp" },
      },
      { kind: "LOGO", storageKey: "/uploads/logo-original.png", altText: null, renditions: null },
    ] as never);

    const assets = await resolveRenderAssets("site-1");

    expect(assets.heroUrl).toBe("/assets/hero-full.webp");
    expect(assets.galleryImages).toEqual([{ url: "/assets/g1-card.webp", alt: "G1" }]);
    // renditions: null (never processed / resize failed open) falls back to the original.
    expect(assets.logoUrl).toBe("/assets/logo-original.png");
  });
});

describe("renderSitePage", () => {
  it("returns null for a slug that doesn't exist in the definition", async () => {
    const result = await renderSitePage({ siteId: "site-1", restaurantId: "r1", definition: definition(), siteUrl: "https://example.com" }, "/nope");
    expect(result).toBeNull();
  });

  it("renders the requested page with live menu data resolved", async () => {
    mockListCategories.mockResolvedValue([
      { id: "c1", restaurantId: "r1", name: "Mains", sortOrder: 0, createdAt: new Date(), updatedAt: new Date(), items: [
        { id: "i1", restaurantId: "r1", categoryId: "c1", name: "Spaghetti", description: null, priceCents: 1500, isAvailable: true, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() },
      ] },
    ] as never);

    const html = await renderSitePage({ siteId: "site-1", restaurantId: "r1", definition: definition(), siteUrl: "https://example.com" }, "/menu");
    expect(html).toContain("Spaghetti");
  });

  it("§Website Builder: resolves a best-seller's imageKey (looked up separately from order history) to a real URL", async () => {
    mockGetTopItems.mockResolvedValue([{ menuItemId: "m1", name: "Spaghetti", quantitySold: 42, revenueCents: 63000 }] as never);
    mockPrisma.menuItem.findMany.mockResolvedValue([{ id: "m1", imageKey: "/uploads/spaghetti.png" }] as never);

    const withBestSellers: SiteDefinition = {
      ...definition(),
      pages: [{ slug: "/", title: "Home", metaDescription: "x", sections: [{ type: "bestSellers", props: {} }] }],
    };

    const html = await renderSitePage(
      { siteId: "site-1", restaurantId: "r1", definition: withBestSellers, siteUrl: "https://example.com" },
      "/",
    );

    expect(mockPrisma.menuItem.findMany).toHaveBeenCalledWith({ where: { id: { in: ["m1"] } }, select: { id: true, imageKey: true } });
    expect(html).toContain('<img src="/assets/spaghetti.png"');
  });
});

describe("renderAllPages", () => {
  it("renders every page in the definition, keyed by slug", async () => {
    const pages = await renderAllPages({ siteId: "site-1", restaurantId: "r1", definition: definition(), siteUrl: "https://example.com" });
    expect(Array.from(pages.keys())).toEqual(["/", "/menu"]);
    expect(pages.get("/")).toContain("<!DOCTYPE html>");
  });
});
