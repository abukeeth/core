import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    site: { findUnique: vi.fn(), update: vi.fn() },
    restaurant: { findUnique: vi.fn() },
    generationJob: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    siteVersion: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("./generator", () => ({ generationJobRunner: { enqueue: vi.fn() } }));

import { prisma } from "../../lib/prisma";
import {
  getGenerationStatus,
  listVariations,
  reapStaleGenerationJobs,
  regenerateVariations,
  selectVariation,
  startGeneration,
} from "./generation.service";
import { generationJobRunner } from "./generator";
import { SiteNotFoundError, VariationNotFoundError } from "./site.errors";

const mockPrisma = vi.mocked(prisma, { deep: true });
const mockRunner = vi.mocked(generationJobRunner, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma));
});

describe("startGeneration", () => {
  it("404s (throws SiteNotFoundError) for a site belonging to another restaurant", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", restaurantId: "other-restaurant" } as never);

    await expect(startGeneration("restaurant-1", "site-1", "user-1")).rejects.toBeInstanceOf(SiteNotFoundError);
    expect(mockRunner.enqueue).not.toHaveBeenCalled();
  });

  it("creates a PENDING GenerationJob row and enqueues the runner with it", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", restaurantId: "restaurant-1" } as never);
    mockPrisma.generationJob.create.mockResolvedValue({ id: "job-1" } as never);

    const job = await startGeneration("restaurant-1", "site-1", "user-1");

    expect(job).toEqual({ id: "job-1" });
    expect(mockPrisma.generationJob.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ siteId: "site-1", stage: "INGEST", status: "PENDING" }) }),
    );
    expect(mockRunner.enqueue).toHaveBeenCalledWith("job-1", "site-1", expect.any(String), "user-1");
  });
});

describe("getGenerationStatus", () => {
  it("throws for a site that isn't the caller's own", async () => {
    mockPrisma.site.findUnique.mockResolvedValue(null);
    await expect(getGenerationStatus("restaurant-1", "site-1")).rejects.toBeInstanceOf(SiteNotFoundError);
  });

  it("returns the most recent job for the site", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", restaurantId: "restaurant-1" } as never);
    mockPrisma.generationJob.findFirst.mockResolvedValue({ id: "job-1", status: "COMPLETED" } as never);

    const result = await getGenerationStatus("restaurant-1", "site-1");
    expect(result).toEqual({ id: "job-1", status: "COMPLETED" });
  });
});

describe("listVariations", () => {
  it("only lists rows still in VARIATION status", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", restaurantId: "restaurant-1" } as never);
    mockPrisma.siteVersion.findMany.mockResolvedValue([] as never);

    await listVariations("restaurant-1", "site-1");

    expect(mockPrisma.siteVersion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { siteId: "site-1", status: "VARIATION" } }),
    );
  });
});

describe("selectVariation", () => {
  it("throws VariationNotFoundError for a version belonging to a different site", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", restaurantId: "restaurant-1" } as never);
    mockPrisma.siteVersion.findUnique.mockResolvedValue({ id: "v1", siteId: "other-site", status: "VARIATION" } as never);

    await expect(selectVariation("restaurant-1", "site-1", "v1")).rejects.toBeInstanceOf(VariationNotFoundError);
  });

  it("throws VariationNotFoundError for a version that's already been selected or archived", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", restaurantId: "restaurant-1" } as never);
    mockPrisma.siteVersion.findUnique.mockResolvedValue({ id: "v1", siteId: "site-1", status: "ARCHIVED" } as never);

    await expect(selectVariation("restaurant-1", "site-1", "v1")).rejects.toBeInstanceOf(VariationNotFoundError);
  });

  it("promotes the variation to DRAFT and updates the site status", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", restaurantId: "restaurant-1" } as never);
    mockPrisma.siteVersion.findUnique.mockResolvedValue({ id: "v1", siteId: "site-1", status: "VARIATION" } as never);
    mockPrisma.siteVersion.update.mockResolvedValue({ id: "v1", status: "DRAFT" } as never);

    const result = await selectVariation("restaurant-1", "site-1", "v1");

    expect(result).toEqual({ id: "v1", status: "DRAFT" });
    expect(mockPrisma.siteVersion.update).toHaveBeenCalledWith({ where: { id: "v1" }, data: { status: "DRAFT" } });
    expect(mockPrisma.site.update).toHaveBeenCalledWith({ where: { id: "site-1" }, data: { status: "DRAFT", previewApprovedAt: null } });
  });
});

describe("regenerateVariations", () => {
  it("delegates to the same generation pipeline as startGeneration", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", restaurantId: "restaurant-1" } as never);
    mockPrisma.generationJob.create.mockResolvedValue({ id: "job-2" } as never);

    const job = await regenerateVariations("restaurant-1", "site-1", "user-1");

    expect(job).toEqual({ id: "job-2" });
    expect(mockRunner.enqueue).toHaveBeenCalledWith("job-2", "site-1", expect.any(String), "user-1");
  });
});

describe("startGeneration (§Job Durability — persists createdById)", () => {
  it("records createdById on the job row so a reaper retry can attribute the batch", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", restaurantId: "restaurant-1" } as never);
    mockPrisma.generationJob.create.mockResolvedValue({ id: "job-1" } as never);

    await startGeneration("restaurant-1", "site-1", "user-9");

    expect(mockPrisma.generationJob.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ createdById: "user-9" }) }),
    );
  });
});

describe("reapStaleGenerationJobs (§Job Durability)", () => {
  const cutoffProbe = new Date("2026-07-14T12:00:00.000Z");

  it("re-enqueues a stale job under the cap, attributed to its stored createdById", async () => {
    mockPrisma.generationJob.findMany.mockResolvedValue([
      { id: "job-1", siteId: "site-1", batchId: "b1", attempts: 1, createdById: "user-9" },
    ] as never);
    mockPrisma.generationJob.updateMany.mockResolvedValue({ count: 1 } as never);

    const result = await reapStaleGenerationJobs(cutoffProbe);

    expect(mockPrisma.generationJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "PENDING", startedAt: null, heartbeatAt: null } }),
    );
    expect(mockRunner.enqueue).toHaveBeenCalledWith("job-1", "site-1", "b1", "user-9");
    expect(result).toEqual({ requeued: 1, failed: 0 });
  });

  it("falls back to the site owner when the job predates the createdById column", async () => {
    mockPrisma.generationJob.findMany.mockResolvedValue([
      { id: "job-1", siteId: "site-1", batchId: "b1", attempts: 0, createdById: null },
    ] as never);
    mockPrisma.site.findUnique.mockResolvedValue({ restaurantId: "r1" } as never);
    mockPrisma.restaurant.findUnique.mockResolvedValue({ ownerId: "owner-7" } as never);
    mockPrisma.generationJob.updateMany.mockResolvedValue({ count: 1 } as never);

    await reapStaleGenerationJobs(cutoffProbe);

    expect(mockRunner.enqueue).toHaveBeenCalledWith("job-1", "site-1", "b1", "owner-7");
  });

  it("fails a stale job that has exhausted MAX_ATTEMPTS", async () => {
    mockPrisma.generationJob.findMany.mockResolvedValue([
      { id: "job-1", siteId: "site-1", batchId: "b1", attempts: 3, createdById: "user-9" },
    ] as never);
    mockPrisma.generationJob.updateMany.mockResolvedValue({ count: 1 } as never);

    const result = await reapStaleGenerationJobs(cutoffProbe);

    expect(mockPrisma.generationJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }),
    );
    expect(mockRunner.enqueue).not.toHaveBeenCalled();
    expect(result).toEqual({ requeued: 0, failed: 1 });
  });

  it("fails a stale job whose owner can't be resolved", async () => {
    mockPrisma.generationJob.findMany.mockResolvedValue([
      { id: "job-1", siteId: "site-1", batchId: "b1", attempts: 0, createdById: null },
    ] as never);
    mockPrisma.site.findUnique.mockResolvedValue(null);
    mockPrisma.generationJob.updateMany.mockResolvedValue({ count: 1 } as never);

    const result = await reapStaleGenerationJobs(cutoffProbe);

    expect(mockRunner.enqueue).not.toHaveBeenCalled();
    expect(result).toEqual({ requeued: 0, failed: 1 });
  });

  it("does nothing when there are no stale jobs", async () => {
    mockPrisma.generationJob.findMany.mockResolvedValue([] as never);

    const result = await reapStaleGenerationJobs(cutoffProbe);

    expect(mockRunner.enqueue).not.toHaveBeenCalled();
    expect(result).toEqual({ requeued: 0, failed: 0 });
  });
});
