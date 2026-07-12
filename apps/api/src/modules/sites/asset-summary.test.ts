import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({
  prisma: { siteAsset: { findMany: vi.fn() } },
}));

import { prisma } from "../../lib/prisma";
import { getAssetSummary } from "./asset-summary";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getAssetSummary", () => {
  it("counts total photo assets and those missing alt text/renditions", async () => {
    mockPrisma.siteAsset.findMany.mockResolvedValue([
      { altText: null, renditions: null },
      { altText: "A photo", renditions: { webp: "x" } },
      { altText: null, renditions: { webp: "x" } },
    ] as never);

    const summary = await getAssetSummary("site-1");

    expect(summary).toEqual({ totalPhotoAssets: 3, altTextMissingCount: 2, unprocessedRenditionsCount: 1 });
  });

  it("only queries HERO and GALLERY kinds", async () => {
    mockPrisma.siteAsset.findMany.mockResolvedValue([] as never);

    await getAssetSummary("site-1");

    expect(mockPrisma.siteAsset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { siteId: "site-1", kind: { in: ["HERO", "GALLERY"] } } }),
    );
  });

  it("returns all zeros when there are no assets", async () => {
    mockPrisma.siteAsset.findMany.mockResolvedValue([] as never);

    const summary = await getAssetSummary("site-1");

    expect(summary).toEqual({ totalPhotoAssets: 0, altTextMissingCount: 0, unprocessedRenditionsCount: 0 });
  });
});
