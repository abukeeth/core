import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    site: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    generationJob: { update: vi.fn() },
    siteVersion: { updateMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    siteScore: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("./ingest", () => ({ ingestRestaurantData: vi.fn() }));
vi.mock("./brand-analysis", () => ({ analyzeBrand: vi.fn() }));
vi.mock("./content-generator", () => ({ generateContentCore: vi.fn(), adaptToneForVariation: vi.fn() }));
vi.mock("./asset-summary", () => ({ getAssetSummary: vi.fn() }));
vi.mock("./scoring/score-aggregator", () => ({ scoreSiteDefinition: vi.fn() }));

import { prisma } from "../../lib/prisma";
import { analyzeBrand } from "./brand-analysis";
import { adaptToneForVariation, generateContentCore } from "./content-generator";
import { getAssetSummary } from "./asset-summary";
import { generationJobRunner } from "./generator";
import { ingestRestaurantData } from "./ingest";
import { scoreSiteDefinition } from "./scoring/score-aggregator";
import type { BrandProfile, ContentCore, IngestData } from "./types";

const mockPrisma = vi.mocked(prisma, { deep: true });
const mockIngest = vi.mocked(ingestRestaurantData);
const mockAnalyzeBrand = vi.mocked(analyzeBrand);
const mockGenerateContentCore = vi.mocked(generateContentCore);
const mockAdaptTone = vi.mocked(adaptToneForVariation);
const mockGetAssetSummary = vi.mocked(getAssetSummary);
const mockScoreSiteDefinition = vi.mocked(scoreSiteDefinition);

const ingestFixture: IngestData = {
  restaurantId: "r1",
  restaurantName: "Trattoria Bella",
  menu: [{ categoryName: "Mains", name: "Spaghetti", priceCents: 1500 }],
  photoCount: 3,
};

const brandProfileFixture: BrandProfile = {
  cuisine: "italian",
  businessType: "bistro",
  priceTier: 2,
  personality: { traditionalContemporary: 0.5, casualFormal: 0.5, playfulSerious: 0.5, understatedBold: 0.5, rusticPolished: 0.5 },
  signalsUsed: [],
  confidence: { cuisine: 0.9, businessType: 0.9, priceTier: 0.9, personality: 0.9 },
};

const contentCoreFixture: ContentCore = {
  tagline: "Great food",
  heroHeadline: "Welcome",
  heroSubhead: "Fresh daily",
  aboutStory: "Our story",
  signatureDishesIntro: "Favorites",
  galleryIntro: "Gallery",
  ctaLabel: "View Menu",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.site.findUniqueOrThrow.mockResolvedValue({ id: "site-1", restaurantId: "r1" } as never);
  mockPrisma.generationJob.update.mockResolvedValue({} as never);
  mockPrisma.site.update.mockResolvedValue({} as never);
  mockIngest.mockResolvedValue(ingestFixture);
  mockAnalyzeBrand.mockResolvedValue(brandProfileFixture);
  mockGenerateContentCore.mockResolvedValue(contentCoreFixture);
  mockAdaptTone.mockResolvedValue(contentCoreFixture);
  mockGetAssetSummary.mockResolvedValue({ totalPhotoAssets: 0, altTextMissingCount: 0, unprocessedRenditionsCount: 0 });
  mockScoreSiteDefinition.mockResolvedValue({
    overall: 90,
    seo: 90,
    performance: 90,
    accessibility: 90,
    brandConsistency: 90,
    conversion: 90,
    suggestions: [],
  });
  mockPrisma.siteVersion.findFirst.mockResolvedValue(null);
  mockPrisma.siteVersion.create.mockResolvedValue({ id: "version-x" } as never);
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma));
});

describe("generationJobRunner.enqueue", () => {
  it("produces exactly 3 SiteVersion rows (one per style family) and marks the job COMPLETED", async () => {
    generationJobRunner.enqueue("job-1", "site-1", "batch-1", "user-1");

    await vi.waitFor(() => expect(mockPrisma.generationJob.update).toHaveBeenCalledWith({ where: { id: "job-1" }, data: { status: "COMPLETED", stage: "FINALIZE" } }));

    expect(mockPrisma.siteVersion.create).toHaveBeenCalledTimes(3);
    expect(mockPrisma.siteScore.create).toHaveBeenCalledTimes(3);
    const families = mockPrisma.siteVersion.create.mock.calls.map((call) => call[0].data.styleFamily);
    expect(new Set(families)).toEqual(new Set(["LUXURY", "MODERN", "MINIMAL"]));
  });

  it("marks the job RUNNING immediately, before any stage work begins (Sprint 11)", async () => {
    generationJobRunner.enqueue("job-1", "site-1", "batch-1", "user-1");

    // Wait for the whole run to finish (not just the RUNNING update) so this
    // background task can't keep executing into the next test with mocks
    // that have since been cleared.
    await vi.waitFor(() => expect(mockPrisma.siteVersion.create).toHaveBeenCalledTimes(3));

    expect(mockPrisma.generationJob.update).toHaveBeenCalledWith({ where: { id: "job-1" }, data: { status: "RUNNING" } });
  });

  it("archives previous VARIATION rows before creating the new batch", async () => {
    generationJobRunner.enqueue("job-1", "site-1", "batch-1", "user-1");

    await vi.waitFor(() => expect(mockPrisma.generationJob.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "COMPLETED" }) })));

    expect(mockPrisma.siteVersion.updateMany).toHaveBeenCalledWith({
      where: { siteId: "site-1", status: "VARIATION" },
      data: { status: "ARCHIVED" },
    });
  });

  it("persists the resolved brand profile onto the Site row", async () => {
    generationJobRunner.enqueue("job-1", "site-1", "batch-1", "user-1");

    await vi.waitFor(() => expect(mockPrisma.site.update).toHaveBeenCalled());

    expect(mockPrisma.site.update).toHaveBeenCalledWith({
      where: { id: "site-1" },
      data: { brandProfile: brandProfileFixture },
    });
  });

  it("marks the job FAILED (not thrown/uncaught) when a stage errors out", async () => {
    mockIngest.mockRejectedValue(new Error("restaurant not found"));

    generationJobRunner.enqueue("job-1", "site-1", "batch-1", "user-1");

    await vi.waitFor(() =>
      expect(mockPrisma.generationJob.update).toHaveBeenCalledWith({
        where: { id: "job-1" },
        data: { status: "FAILED", error: "restaurant not found" },
      }),
    );

    expect(mockPrisma.siteVersion.create).not.toHaveBeenCalled();
  });

  it("tags every created version with the given batchId and createdById", async () => {
    generationJobRunner.enqueue("job-1", "site-1", "batch-42", "user-9");

    await vi.waitFor(() => expect(mockPrisma.siteVersion.create).toHaveBeenCalledTimes(3));

    for (const call of mockPrisma.siteVersion.create.mock.calls) {
      expect(call[0].data.generationBatchId).toBe("batch-42");
      expect(call[0].data.createdById).toBe("user-9");
    }
  });
});
