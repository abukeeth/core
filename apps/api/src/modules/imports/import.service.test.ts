import { ImportStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    importJob: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  },
}));

vi.mock("../../lib/file-storage", () => ({
  fileStorage: { save: vi.fn(), read: vi.fn() },
}));

vi.mock("./job-runner", () => ({
  importJobRunner: { enqueue: vi.fn(), enqueueConsolidated: vi.fn() },
}));

vi.mock("../menu/menu.service", () => ({
  createCategory: vi.fn(),
  createItem: vi.fn(),
}));

vi.mock("../restaurants/restaurant.service", () => ({
  updateRestaurantById: vi.fn(),
}));

import { fileStorage } from "../../lib/file-storage";
import { prisma } from "../../lib/prisma";
import { createCategory, createItem } from "../menu/menu.service";
import { updateRestaurantById } from "../restaurants/restaurant.service";
import { ImportJobNotFoundError, ImportJobNotReadyError, ImportJobNotRerunnableError } from "./import.errors";
import { approveJob, createConsolidatedImportJob, createImportJob, reapStaleImportJobs, rejectJob, rerunJob, updateJobData } from "./import.service";
import { importJobRunner } from "./job-runner";

const mockPrisma = vi.mocked(prisma, { deep: true });
const mockFileStorage = vi.mocked(fileStorage, { deep: true });
const mockJobRunner = vi.mocked(importJobRunner, { deep: true });
const mockCreateCategory = vi.mocked(createCategory);
const mockCreateItem = vi.mocked(createItem);
const mockUpdateRestaurantById = vi.mocked(updateRestaurantById);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createImportJob", () => {
  it("saves the file, creates the job row, and enqueues the runner", async () => {
    mockFileStorage.save.mockResolvedValue({ path: "/uploads/abc.pdf" });
    mockPrisma.importJob.create.mockResolvedValue({ id: "job-1" } as never);

    const job = await createImportJob(
      "restaurant-1",
      "user-1",
      { sourceType: "PDF" as never },
      { buffer: Buffer.from("x"), mimeType: "application/pdf", originalName: "menu.pdf" },
    );

    expect(job).toEqual({ id: "job-1" });
    expect(mockFileStorage.save).toHaveBeenCalledWith(Buffer.from("x"), "menu.pdf");
    expect(mockPrisma.importJob.create).toHaveBeenCalledWith({
      data: {
        restaurantId: "restaurant-1",
        createdById: "user-1",
        sourceType: "PDF",
        sourceFilePath: "/uploads/abc.pdf",
        sourceMimeType: "application/pdf",
      },
    });
    expect(mockJobRunner.enqueue).toHaveBeenCalledWith("job-1", {
      kind: "file",
      buffer: Buffer.from("x"),
      mimeType: "application/pdf",
    });
  });

  it("still creates and enqueues the job when persisting a copy of the file fails (e.g. no writable local disk)", async () => {
    mockFileStorage.save.mockRejectedValue(new Error("ENOENT: no such file or directory, mkdir '/var/task/uploads'"));
    mockPrisma.importJob.create.mockResolvedValue({ id: "job-1" } as never);

    const job = await createImportJob(
      "restaurant-1",
      "user-1",
      { sourceType: "PDF" as never },
      { buffer: Buffer.from("x"), mimeType: "application/pdf", originalName: "menu.pdf" },
    );

    expect(job).toEqual({ id: "job-1" });
    expect(mockPrisma.importJob.create).toHaveBeenCalledWith({
      data: {
        restaurantId: "restaurant-1",
        createdById: "user-1",
        sourceType: "PDF",
        sourceFilePath: undefined,
        sourceMimeType: undefined,
      },
    });
    expect(mockJobRunner.enqueue).toHaveBeenCalledWith("job-1", {
      kind: "file",
      buffer: Buffer.from("x"),
      mimeType: "application/pdf",
    });
  });
});

describe("updateJobData", () => {
  it("persists edited extractedData while the job is awaiting review", async () => {
    mockPrisma.importJob.findUnique.mockResolvedValue({
      id: "job-1",
      restaurantId: "my-restaurant",
      status: ImportStatus.AWAITING_REVIEW,
    } as never);
    mockPrisma.importJob.update.mockResolvedValue({ id: "job-1" } as never);

    const edited = { categories: [{ name: "Mains", items: [{ name: "Burger", priceCents: 1200 }] }] };
    await updateJobData("my-restaurant", "job-1", edited);

    expect(mockPrisma.importJob.update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: { extractedData: edited },
    });
  });

  it("rejects editing a job that isn't awaiting review", async () => {
    mockPrisma.importJob.findUnique.mockResolvedValue({
      id: "job-1",
      restaurantId: "my-restaurant",
      status: ImportStatus.APPROVED,
    } as never);

    await expect(updateJobData("my-restaurant", "job-1", { categories: [] })).rejects.toBeInstanceOf(
      ImportJobNotReadyError,
    );
    expect(mockPrisma.importJob.update).not.toHaveBeenCalled();
  });

  it("rejects editing a job belonging to a different restaurant", async () => {
    mockPrisma.importJob.findUnique.mockResolvedValue({ id: "job-1", restaurantId: "other-restaurant" } as never);

    await expect(updateJobData("my-restaurant", "job-1", { categories: [] })).rejects.toBeInstanceOf(
      ImportJobNotFoundError,
    );
  });
});

describe("rerunJob", () => {
  it("re-reads the stored file and re-enqueues extraction with its saved mimeType", async () => {
    mockPrisma.importJob.findUnique.mockResolvedValue({
      id: "job-1",
      restaurantId: "my-restaurant",
      sourceFilePath: "/uploads/abc.pdf",
      sourceMimeType: "application/pdf",
      sourceUrl: null,
    } as never);
    mockFileStorage.read.mockResolvedValue(Buffer.from("pdf-bytes"));
    mockPrisma.importJob.update.mockResolvedValue({ id: "job-1", status: ImportStatus.PENDING } as never);

    const result = await rerunJob("my-restaurant", "job-1");

    expect(mockFileStorage.read).toHaveBeenCalledWith("/uploads/abc.pdf");
    expect(mockJobRunner.enqueue).toHaveBeenCalledWith("job-1", {
      kind: "file",
      buffer: Buffer.from("pdf-bytes"),
      mimeType: "application/pdf",
    });
    expect(mockPrisma.importJob.update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      // §Job Durability — a manual rerun is a fresh start, so it also resets
      // the attempt counter and liveness bookkeeping.
      data: {
        status: ImportStatus.PENDING,
        errorMessage: null,
        extractedData: expect.anything(),
        reviewedAt: null,
        attempts: 0,
        startedAt: null,
        heartbeatAt: null,
      },
    });
    expect(result).toEqual({ id: "job-1", status: ImportStatus.PENDING });
  });

  it("re-enqueues a url-based job with its stored sourceUrl", async () => {
    mockPrisma.importJob.findUnique.mockResolvedValue({
      id: "job-1",
      restaurantId: "my-restaurant",
      sourceFilePath: null,
      sourceUrl: "https://example.com/menu",
    } as never);
    mockPrisma.importJob.update.mockResolvedValue({ id: "job-1", status: ImportStatus.PENDING } as never);

    await rerunJob("my-restaurant", "job-1");

    expect(mockFileStorage.read).not.toHaveBeenCalled();
    expect(mockJobRunner.enqueue).toHaveBeenCalledWith("job-1", { kind: "url", url: "https://example.com/menu" });
  });

  it("throws when the job has neither a stored file nor a URL", async () => {
    mockPrisma.importJob.findUnique.mockResolvedValue({
      id: "job-1",
      restaurantId: "my-restaurant",
      sourceFilePath: null,
      sourceUrl: null,
    } as never);

    await expect(rerunJob("my-restaurant", "job-1")).rejects.toBeInstanceOf(ImportJobNotRerunnableError);
    expect(mockJobRunner.enqueue).not.toHaveBeenCalled();
  });

  it("rejects rerunning a job that belongs to a different restaurant", async () => {
    mockPrisma.importJob.findUnique.mockResolvedValue({ id: "job-1", restaurantId: "other-restaurant" } as never);

    await expect(rerunJob("my-restaurant", "job-1")).rejects.toBeInstanceOf(ImportJobNotFoundError);
  });
});

describe("reapStaleImportJobs (§Job Durability)", () => {
  const cutoffProbe = new Date("2026-07-14T12:00:00.000Z");

  it("re-enqueues a stale file-based job under the attempt cap, rebuilding its source", async () => {
    mockPrisma.importJob.findMany.mockResolvedValue([
      { id: "job-1", attempts: 1, sourceFilePath: "/uploads/a.pdf", sourceMimeType: "application/pdf", sourceUrl: null },
    ] as never);
    mockFileStorage.read.mockResolvedValue(Buffer.from("pdf"));
    mockPrisma.importJob.updateMany.mockResolvedValue({ count: 1 } as never);

    const result = await reapStaleImportJobs(cutoffProbe);

    expect(mockPrisma.importJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: ImportStatus.PENDING, startedAt: null, heartbeatAt: null } }),
    );
    expect(mockJobRunner.enqueue).toHaveBeenCalledWith("job-1", { kind: "file", buffer: Buffer.from("pdf"), mimeType: "application/pdf" });
    expect(result).toEqual({ requeued: 1, failed: 0 });
  });

  it("re-enqueues a stale url-based job without touching file storage", async () => {
    mockPrisma.importJob.findMany.mockResolvedValue([
      { id: "job-1", attempts: 0, sourceFilePath: null, sourceUrl: "https://example.com/menu" },
    ] as never);
    mockPrisma.importJob.updateMany.mockResolvedValue({ count: 1 } as never);

    await reapStaleImportJobs(cutoffProbe);

    expect(mockFileStorage.read).not.toHaveBeenCalled();
    expect(mockJobRunner.enqueue).toHaveBeenCalledWith("job-1", { kind: "url", url: "https://example.com/menu" });
  });

  it("fails (does not retry) a stale job that has exhausted MAX_ATTEMPTS", async () => {
    mockPrisma.importJob.findMany.mockResolvedValue([
      { id: "job-1", attempts: 3, sourceFilePath: "/uploads/a.pdf", sourceUrl: null },
    ] as never);
    mockPrisma.importJob.updateMany.mockResolvedValue({ count: 1 } as never);

    const result = await reapStaleImportJobs(cutoffProbe);

    expect(mockPrisma.importJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: ImportStatus.FAILED }) }),
    );
    expect(mockJobRunner.enqueue).not.toHaveBeenCalled();
    expect(result).toEqual({ requeued: 0, failed: 1 });
  });

  it("fails a stale job that can't be retried (no stored file or url)", async () => {
    mockPrisma.importJob.findMany.mockResolvedValue([{ id: "job-1", attempts: 0, sourceFilePath: null, sourceUrl: null }] as never);
    mockPrisma.importJob.updateMany.mockResolvedValue({ count: 1 } as never);

    const result = await reapStaleImportJobs(cutoffProbe);

    expect(mockJobRunner.enqueue).not.toHaveBeenCalled();
    expect(result).toEqual({ requeued: 0, failed: 1 });
  });

  it("fails a stale job whose stored file is no longer readable", async () => {
    mockPrisma.importJob.findMany.mockResolvedValue([
      { id: "job-1", attempts: 0, sourceFilePath: "/uploads/gone.pdf", sourceMimeType: "application/pdf", sourceUrl: null },
    ] as never);
    mockFileStorage.read.mockRejectedValue(new Error("ENOENT"));
    mockPrisma.importJob.updateMany.mockResolvedValue({ count: 1 } as never);

    const result = await reapStaleImportJobs(cutoffProbe);

    expect(mockJobRunner.enqueue).not.toHaveBeenCalled();
    expect(result).toEqual({ requeued: 0, failed: 1 });
  });

  it("does nothing when there are no stale jobs", async () => {
    mockPrisma.importJob.findMany.mockResolvedValue([] as never);

    const result = await reapStaleImportJobs(cutoffProbe);

    expect(mockJobRunner.enqueue).not.toHaveBeenCalled();
    expect(mockPrisma.importJob.updateMany).not.toHaveBeenCalled();
    expect(result).toEqual({ requeued: 0, failed: 0 });
  });
});

describe("tenant isolation", () => {
  it("rejects approving a job that belongs to a different restaurant", async () => {
    mockPrisma.importJob.findUnique.mockResolvedValue({ id: "job-1", restaurantId: "other-restaurant" } as never);

    await expect(approveJob("my-restaurant", "job-1")).rejects.toBeInstanceOf(ImportJobNotFoundError);
    expect(mockPrisma.importJob.update).not.toHaveBeenCalled();
  });

  it("rejects rejecting a job that belongs to a different restaurant", async () => {
    mockPrisma.importJob.findUnique.mockResolvedValue({ id: "job-1", restaurantId: "other-restaurant" } as never);

    await expect(rejectJob("my-restaurant", "job-1")).rejects.toBeInstanceOf(ImportJobNotFoundError);
  });
});

describe("approveJob", () => {
  it("rejects a job that isn't awaiting review", async () => {
    mockPrisma.importJob.findUnique.mockResolvedValue({
      id: "job-1",
      restaurantId: "my-restaurant",
      status: ImportStatus.PROCESSING,
      extractedData: null,
    } as never);

    await expect(approveJob("my-restaurant", "job-1")).rejects.toBeInstanceOf(ImportJobNotReadyError);
    expect(mockCreateCategory).not.toHaveBeenCalled();
  });

  it("commits extracted categories/items into the menu, scoped to the caller's restaurant", async () => {
    mockPrisma.importJob.findUnique.mockResolvedValue({
      id: "job-1",
      restaurantId: "my-restaurant",
      status: ImportStatus.AWAITING_REVIEW,
      extractedData: {
        categories: [{ name: "Appetizers", items: [{ name: "Spring Rolls", priceCents: 599 }] }],
      },
    } as never);
    mockCreateCategory.mockResolvedValue({ id: "category-1" } as never);
    mockPrisma.importJob.update.mockResolvedValue({ id: "job-1", status: ImportStatus.APPROVED } as never);

    const result = await approveJob("my-restaurant", "job-1");

    expect(mockCreateCategory).toHaveBeenCalledWith("my-restaurant", { name: "Appetizers" });
    expect(mockCreateItem).toHaveBeenCalledWith("my-restaurant", {
      categoryId: "category-1",
      name: "Spring Rolls",
      description: undefined,
      priceCents: 599,
    });
    expect(result).toEqual({ id: "job-1", status: ImportStatus.APPROVED });
  });

  it("applies businessProfile to the restaurant when present, in addition to creating menu items", async () => {
    mockPrisma.importJob.findUnique.mockResolvedValue({
      id: "job-1",
      restaurantId: "my-restaurant",
      status: ImportStatus.AWAITING_REVIEW,
      extractedData: {
        categories: [{ name: "Mains", items: [{ name: "Burger", priceCents: 999 }] }],
        businessProfile: { name: "Joe's Diner", address: "123 Main St" },
      },
    } as never);
    mockPrisma.importJob.update.mockResolvedValue({ id: "job-1", status: ImportStatus.APPROVED } as never);

    await approveJob("my-restaurant", "job-1");

    expect(mockUpdateRestaurantById).toHaveBeenCalledWith("my-restaurant", {
      name: "Joe's Diner",
      address: "123 Main St",
    });
  });

  it("does not touch the restaurant profile when businessProfile is absent", async () => {
    mockPrisma.importJob.findUnique.mockResolvedValue({
      id: "job-1",
      restaurantId: "my-restaurant",
      status: ImportStatus.AWAITING_REVIEW,
      extractedData: { categories: [{ name: "Mains", items: [{ name: "Burger", priceCents: 999 }] }] },
    } as never);
    mockPrisma.importJob.update.mockResolvedValue({ id: "job-1", status: ImportStatus.APPROVED } as never);

    await approveJob("my-restaurant", "job-1");

    expect(mockUpdateRestaurantById).not.toHaveBeenCalled();
  });
});

describe("createConsolidatedImportJob (Onboarding V3)", () => {
  it("creates one MULTI job and enqueues consolidated extraction with the mapped sources", async () => {
    mockPrisma.importJob.create.mockResolvedValue({ id: "multi-1", sourceType: "MULTI" } as never);

    const job = await createConsolidatedImportJob("rest-1", "owner-1", {
      images: [{ buffer: Buffer.from("img"), mimeType: "image/jpeg", originalName: "a.jpg" }],
      pdfs: [{ buffer: Buffer.from("pdf"), mimeType: "application/pdf", originalName: "menu.pdf" }],
      websiteUrl: "https://example.com",
      googleMapsUrl: "https://maps.google.com/x",
    });

    expect(job.id).toBe("multi-1");
    expect(mockPrisma.importJob.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ restaurantId: "rest-1", createdById: "owner-1", sourceType: "MULTI" }) }),
    );
    expect(mockJobRunner.enqueueConsolidated).toHaveBeenCalledTimes(1);
    const [enqueuedId, sources] = mockJobRunner.enqueueConsolidated.mock.calls[0]!;
    expect(enqueuedId).toBe("multi-1");
    expect(sources).toMatchObject({
      images: [{ mimeType: "image/jpeg", originalName: "a.jpg" }],
      pdfs: [{ mimeType: "application/pdf" }],
      websiteUrl: "https://example.com",
      googleMapsUrl: "https://maps.google.com/x",
    });
  });
});
