import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetMySite = vi.fn();
const mockCreateSite = vi.fn();
const mockGetGenerationStatus = vi.fn();
const mockStartGeneration = vi.fn();
const mockRegenerateVariations = vi.fn();
const mockListVariations = vi.fn();
const mockSelectVariation = vi.fn();
const mockPublishSite = vi.fn();

vi.mock("@/lib/api", () => ({
  getMySite: (...args: unknown[]) => mockGetMySite(...args),
  createSite: (...args: unknown[]) => mockCreateSite(...args),
  getGenerationStatus: (...args: unknown[]) => mockGetGenerationStatus(...args),
  startGeneration: (...args: unknown[]) => mockStartGeneration(...args),
  regenerateVariations: (...args: unknown[]) => mockRegenerateVariations(...args),
  listVariations: (...args: unknown[]) => mockListVariations(...args),
  selectVariation: (...args: unknown[]) => mockSelectVariation(...args),
  publishSite: (...args: unknown[]) => mockPublishSite(...args),
}));

const mockCreateTable = vi.fn();
vi.mock("@/lib/owner-commerce-api", () => ({
  createTable: (...args: unknown[]) => mockCreateTable(...args),
}));

import { useRestaurantBuilder } from "./use-restaurant-builder";

function site(overrides: Record<string, unknown> = {}) {
  return { id: "site-1", restaurantId: "r1", slug: "joes-diner", status: "DRAFT", publishedVersionId: null, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateTable.mockResolvedValue({ table: { id: "t1", qrToken: "tok-abc" } });
});

describe("useRestaurantBuilder", () => {
  it("creates a site when none exists yet, then starts generation", async () => {
    mockGetMySite.mockRejectedValue(new Error("not found"));
    mockCreateSite.mockResolvedValue({ site: site() });
    mockGetGenerationStatus.mockResolvedValue({ job: null });
    mockStartGeneration.mockResolvedValue({ job: { id: "job-1", siteId: "site-1", batchId: "b1", stage: "INGEST", status: "PENDING", error: null } });

    const { result } = renderHook(() => useRestaurantBuilder());

    await waitFor(() => expect(result.current.phase).toBe("generating"));
    expect(mockCreateSite).toHaveBeenCalled();
    expect(mockStartGeneration).toHaveBeenCalledWith("site-1");
  });

  it("reuses an existing site instead of creating a new one", async () => {
    mockGetMySite.mockResolvedValue({ site: site() });
    mockGetGenerationStatus.mockResolvedValue({ job: null });
    mockStartGeneration.mockResolvedValue({ job: { id: "job-1", siteId: "site-1", batchId: "b1", stage: "INGEST", status: "PENDING", error: null } });

    renderHook(() => useRestaurantBuilder());

    await waitFor(() => expect(mockStartGeneration).toHaveBeenCalled());
    expect(mockCreateSite).not.toHaveBeenCalled();
  });

  it("resumes straight to the finale when the site is already published", async () => {
    mockGetMySite.mockResolvedValue({ site: site({ status: "PUBLISHED", publishedVersionId: "v-99" }) });

    const { result } = renderHook(() => useRestaurantBuilder());

    await waitFor(() => expect(result.current.phase).toBe("done"));
    expect(result.current.publishedVersionId).toBe("v-99");
    expect(mockStartGeneration).not.toHaveBeenCalled();
  });

  it("resumes polling an already-running generation job instead of starting a new one", async () => {
    mockGetMySite.mockResolvedValue({ site: site() });
    mockGetGenerationStatus.mockResolvedValue({
      job: { id: "job-1", siteId: "site-1", batchId: "b1", stage: "THEME_SELECTION", status: "RUNNING", error: null },
    });

    const { result } = renderHook(() => useRestaurantBuilder());

    await waitFor(() => expect(result.current.phase).toBe("generating"));
    expect(mockStartGeneration).not.toHaveBeenCalled();
    expect(result.current.job?.stage).toBe("THEME_SELECTION");
  });

  it("moves to generation_failed when the resumed job already failed", async () => {
    mockGetMySite.mockResolvedValue({ site: site() });
    mockGetGenerationStatus.mockResolvedValue({
      job: { id: "job-1", siteId: "site-1", batchId: "b1", stage: "SCORING", status: "FAILED", error: "AI provider unavailable" },
    });

    const { result } = renderHook(() => useRestaurantBuilder());

    await waitFor(() => expect(result.current.phase).toBe("generation_failed"));
  });

  it("auto-selects the highest-scoring variation, publishes, and provisions a QR code once generation completes", async () => {
    mockGetMySite.mockResolvedValue({ site: site() });
    mockGetGenerationStatus.mockResolvedValue({
      job: { id: "job-1", siteId: "site-1", batchId: "b1", stage: "FINALIZE", status: "COMPLETED", error: null },
    });
    mockListVariations.mockResolvedValue({
      variations: [
        { id: "v-low", scores: [{ overall: 60 }], definition: { tagline: "Low", cuisine: "diner", colorSeed: "#111111" } },
        { id: "v-best", scores: [{ overall: 92 }], definition: { tagline: "Best", cuisine: "italian", colorSeed: "#e8590c" } },
        { id: "v-mid", scores: [{ overall: 75 }], definition: { tagline: "Mid", cuisine: "diner", colorSeed: "#222222" } },
      ],
    });
    mockSelectVariation.mockResolvedValue({ version: { id: "v-best" } });
    mockPublishSite.mockResolvedValue({ version: { id: "v-best" } });

    const { result } = renderHook(() => useRestaurantBuilder());

    await waitFor(() => expect(result.current.phase).toBe("done"));
    expect(mockSelectVariation).toHaveBeenCalledWith("site-1", "v-best");
    expect(mockPublishSite).toHaveBeenCalledWith("site-1");
    expect(mockCreateTable).toHaveBeenCalledWith("Scan to Order");
    expect(result.current.qrToken).toBe("tok-abc");
    expect(result.current.publishedVersionId).toBe("v-best");
    expect(result.current.winnerId).toBe("v-best");
    expect(result.current.winningDesign).toEqual({ tagline: "Best", cuisine: "italian", colorSeed: "#e8590c" });
    expect(result.current.candidates).toHaveLength(3);
    expect(result.current.candidates.find((c) => c.id === "v-best")?.colorSeed).toBe("#e8590c");
  });

  it("still reaches done when QR provisioning fails — non-fatal", async () => {
    mockGetMySite.mockResolvedValue({ site: site() });
    mockGetGenerationStatus.mockResolvedValue({
      job: { id: "job-1", siteId: "site-1", batchId: "b1", stage: "FINALIZE", status: "COMPLETED", error: null },
    });
    mockListVariations.mockResolvedValue({ variations: [{ id: "v-1", scores: [{ overall: 80 }] }] });
    mockSelectVariation.mockResolvedValue({ version: { id: "v-1" } });
    mockPublishSite.mockResolvedValue({ version: { id: "v-1" } });
    mockCreateTable.mockRejectedValue(new Error("table service down"));

    const { result } = renderHook(() => useRestaurantBuilder());

    await waitFor(() => expect(result.current.phase).toBe("done"));
    expect(result.current.qrToken).toBeNull();
    expect(result.current.qrError).toBe("table service down");
  });

  it("moves to finish_failed with the publish error when publishing fails", async () => {
    mockGetMySite.mockResolvedValue({ site: site() });
    mockGetGenerationStatus.mockResolvedValue({
      job: { id: "job-1", siteId: "site-1", batchId: "b1", stage: "FINALIZE", status: "COMPLETED", error: null },
    });
    mockListVariations.mockResolvedValue({ variations: [{ id: "v-1", scores: [{ overall: 80 }] }] });
    mockSelectVariation.mockResolvedValue({ version: { id: "v-1" } });
    mockPublishSite.mockRejectedValue(new Error("2 image(s) haven't finished processing yet"));

    const { result } = renderHook(() => useRestaurantBuilder());

    await waitFor(() => expect(result.current.phase).toBe("finish_failed"));
    expect(result.current.finishFailure).toEqual({ step: "PUBLISHING", message: "2 image(s) haven't finished processing yet" });
    expect(mockCreateTable).not.toHaveBeenCalled();
  });

  it("retryGeneration calls regenerateVariations and resumes the generating phase", async () => {
    mockGetMySite.mockResolvedValue({ site: site() });
    mockGetGenerationStatus.mockResolvedValue({
      job: { id: "job-1", siteId: "site-1", batchId: "b1", stage: "BRAND_ANALYSIS", status: "FAILED", error: "boom" },
    });
    mockRegenerateVariations.mockResolvedValue({ job: { id: "job-2", siteId: "site-1", batchId: "b2", stage: "INGEST", status: "PENDING", error: null } });

    const { result } = renderHook(() => useRestaurantBuilder());
    await waitFor(() => expect(result.current.phase).toBe("generation_failed"));

    act(() => result.current.retryGeneration());

    await waitFor(() => expect(result.current.phase).toBe("generating"));
    expect(mockRegenerateVariations).toHaveBeenCalledWith("site-1");
  });
});
