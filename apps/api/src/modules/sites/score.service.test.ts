import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    site: { findUnique: vi.fn() },
    siteVersion: { findUnique: vi.fn(), update: vi.fn() },
    siteScore: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock("./asset-summary", () => ({ getAssetSummary: vi.fn() }));
vi.mock("./asset.service", () => ({ autoFillMissingAltText: vi.fn() }));
vi.mock("./scoring/score-aggregator", () => ({ scoreSiteDefinition: vi.fn() }));

import { prisma } from "../../lib/prisma";
import { getAssetSummary } from "./asset-summary";
import { autoFillMissingAltText } from "./asset.service";
import { applySuggestion, getLatestScore, runScore } from "./score.service";
import { scoreSiteDefinition } from "./scoring/score-aggregator";
import { SiteVersionNotFoundError, SuggestionNotFoundError } from "./site.errors";
import { THEME_CATALOG } from "./theme-catalog";
import type { SiteDefinition } from "./types";

const mockPrisma = vi.mocked(prisma, { deep: true });
const mockGetAssetSummary = vi.mocked(getAssetSummary);
const mockScoreSiteDefinition = vi.mocked(scoreSiteDefinition);
const mockAutoFillAltText = vi.mocked(autoFillMissingAltText);

const theme = THEME_CATALOG.find((t) => t.key === "modern-bistro")!;

function definition(): SiteDefinition {
  return {
    schemaVersion: 1,
    restaurantName: "Trattoria Bella",
    tagline: "Handmade pasta",
    cuisine: "italian",
    businessType: "bistro",
    styleFamily: "MODERN",
    themeKey: theme.key,
    themeVersion: theme.version,
    colorSeed: theme.tokens.colorSeed,
    typography: theme.tokens.typography,
    facts: { restaurantName: "Trattoria Bella", hasOnlineOrdering: false, hasReservations: false },
    pages: [
      {
        slug: "/",
        title: "Home — Trattoria Bella | Italian",
        metaDescription: "Handmade pasta, made fresh daily.",
        sections: [{ type: "hero", props: { heroImageLuminance: 0.9, scrimOpacity: 0 } }, { type: "footer", props: {} }],
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAssetSummary.mockResolvedValue({ totalPhotoAssets: 0, altTextMissingCount: 0, unprocessedRenditionsCount: 0 });
  mockScoreSiteDefinition.mockResolvedValue({ overall: 85, seo: 85, performance: 85, accessibility: 85, brandConsistency: 85, conversion: 85, suggestions: [] });
  mockPrisma.siteVersion.update.mockResolvedValue({} as never);
  mockPrisma.siteScore.create.mockResolvedValue({ id: "score-1", overall: 85 } as never);
});

describe("runScore", () => {
  it("throws SiteVersionNotFoundError for a version belonging to a different site", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", restaurantId: "restaurant-1", brandProfile: null } as never);
    mockPrisma.siteVersion.findUnique.mockResolvedValue({ id: "v1", siteId: "other-site" } as never);

    await expect(runScore("restaurant-1", "site-1", "v1")).rejects.toBeInstanceOf(SiteVersionNotFoundError);
  });

  it("persists a MANUAL-source score", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", restaurantId: "restaurant-1", brandProfile: null } as never);
    mockPrisma.siteVersion.findUnique.mockResolvedValue({ id: "v1", siteId: "site-1", definition: definition() } as never);

    await runScore("restaurant-1", "site-1", "v1");

    expect(mockPrisma.siteScore.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ source: "MANUAL", overall: 85 }) }));
  });
});

describe("getLatestScore", () => {
  it("returns the most recently measured score", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", restaurantId: "restaurant-1" } as never);
    mockPrisma.siteVersion.findUnique.mockResolvedValue({ id: "v1", siteId: "site-1" } as never);
    mockPrisma.siteScore.findFirst.mockResolvedValue({ id: "score-1", overall: 90 } as never);

    const result = await getLatestScore("restaurant-1", "site-1", "v1");
    expect(result).toEqual({ id: "score-1", overall: 90 });
  });
});

describe("applySuggestion", () => {
  it("throws SuggestionNotFoundError for a suggestion with no autoFixKind", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", restaurantId: "restaurant-1", brandProfile: null } as never);
    mockPrisma.siteVersion.findUnique.mockResolvedValue({ id: "v1", siteId: "site-1", definition: definition() } as never);

    await expect(
      applySuggestion("restaurant-1", "site-1", "v1", { id: "x", dimension: "seo", issue: "x", impact: "low", suggestion: "x" }),
    ).rejects.toBeInstanceOf(SuggestionNotFoundError);
  });

  it("dispatches missingAltText to the asset layer instead of mutating the definition", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", restaurantId: "restaurant-1", brandProfile: null } as never);
    mockPrisma.siteVersion.findUnique.mockResolvedValue({ id: "v1", siteId: "site-1", definition: definition() } as never);
    mockAutoFillAltText.mockResolvedValue(2);

    await applySuggestion("restaurant-1", "site-1", "v1", {
      id: "x",
      dimension: "seo",
      issue: "x",
      impact: "medium",
      suggestion: "x",
      autoFixKind: "missingAltText",
    });

    expect(mockAutoFillAltText).toHaveBeenCalledWith("restaurant-1", "site-1");
    expect(mockPrisma.siteVersion.update).not.toHaveBeenCalled();
  });

  it("applies a heroContrast fix to the definition and re-scores", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", restaurantId: "restaurant-1", brandProfile: null } as never);
    mockPrisma.siteVersion.findUnique.mockResolvedValue({ id: "v1", siteId: "site-1", definition: definition() } as never);

    const result = await applySuggestion("restaurant-1", "site-1", "v1", {
      id: "x",
      dimension: "accessibility",
      issue: "x",
      impact: "high",
      suggestion: "x",
      autoFixKind: "heroContrast",
    });

    expect(mockPrisma.siteVersion.update).toHaveBeenCalled();
    const savedDefinition = mockPrisma.siteVersion.update.mock.calls[0][0].data.definition as SiteDefinition;
    const heroProps = savedDefinition.pages[0].sections[0].props as { scrimOpacity: number };
    expect(heroProps.scrimOpacity).toBeGreaterThan(0);
    expect(result).toEqual({ id: "score-1", overall: 85 });
  });
});
