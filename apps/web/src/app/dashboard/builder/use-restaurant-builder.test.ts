import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetMySite = vi.fn();
const mockCreateSite = vi.fn();
const mockGetGenerationStatus = vi.fn();
const mockStartGeneration = vi.fn();
const mockRegenerateVariations = vi.fn();
const mockListVariations = vi.fn();
const mockSelectVariation = vi.fn();
const mockApprovePreview = vi.fn();
const mockPublishSite = vi.fn();

vi.mock("@/lib/api", () => ({
  getMySite: (...args: unknown[]) => mockGetMySite(...args),
  createSite: (...args: unknown[]) => mockCreateSite(...args),
  getGenerationStatus: (...args: unknown[]) => mockGetGenerationStatus(...args),
  startGeneration: (...args: unknown[]) => mockStartGeneration(...args),
  regenerateVariations: (...args: unknown[]) => mockRegenerateVariations(...args),
  listVariations: (...args: unknown[]) => mockListVariations(...args),
  selectVariation: (...args: unknown[]) => mockSelectVariation(...args),
  approvePreview: (...args: unknown[]) => mockApprovePreview(...args),
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

/** Generation already COMPLETED with three scored variations, ready to auto-select. */
function completedWithVariations() {
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
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateTable.mockResolvedValue({ table: { id: "t1", qrToken: "tok-abc" } });
});

describe("useRestaurantBuilder — bootstrap & generation (unchanged behavior)", () => {
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

  it("resumes straight to the finale when the site is already published", async () => {
    mockGetMySite.mockResolvedValue({ site: site({ status: "PUBLISHED", publishedVersionId: "v-99" }) });

    const { result } = renderHook(() => useRestaurantBuilder());

    await waitFor(() => expect(result.current.phase).toBe("done"));
    expect(result.current.publishedVersionId).toBe("v-99");
    expect(mockStartGeneration).not.toHaveBeenCalled();
  });

  it("moves to generation_failed when the resumed job already failed", async () => {
    mockGetMySite.mockResolvedValue({ site: site() });
    mockGetGenerationStatus.mockResolvedValue({
      job: { id: "job-1", siteId: "site-1", batchId: "b1", stage: "SCORING", status: "FAILED", error: "AI provider unavailable" },
    });

    const { result } = renderHook(() => useRestaurantBuilder());

    await waitFor(() => expect(result.current.phase).toBe("generation_failed"));
  });
});

describe("useRestaurantBuilder — approval gate (the fix)", () => {
  it("auto-selects the best variation and STOPS at review — it never auto-approves or auto-publishes", async () => {
    completedWithVariations();

    const { result } = renderHook(() => useRestaurantBuilder());

    await waitFor(() => expect(result.current.phase).toBe("review"));
    // A design is selected so a real preview exists...
    expect(mockSelectVariation).toHaveBeenCalledWith("site-1", "v-best");
    expect(result.current.selectedVersionId).toBe("v-best");
    expect(result.current.candidates).toHaveLength(3);
    // ...but NOTHING is approved or published without the owner acting.
    expect(mockApprovePreview).not.toHaveBeenCalled();
    expect(mockPublishSite).not.toHaveBeenCalled();
    expect(mockCreateTable).not.toHaveBeenCalled();
  });

  it("(1) never calls publish before approval; (2) approve is called before publish; (3) publish only after approve succeeds", async () => {
    completedWithVariations();
    const callOrder: string[] = [];
    mockApprovePreview.mockImplementation(async () => {
      callOrder.push("approve");
      return { site: site() };
    });
    mockPublishSite.mockImplementation(async () => {
      callOrder.push("publish");
      return { version: { id: "v-best" } };
    });

    const { result } = renderHook(() => useRestaurantBuilder());
    await waitFor(() => expect(result.current.phase).toBe("review"));

    // At the review gate, publish has NOT run yet.
    expect(mockPublishSite).not.toHaveBeenCalled();

    act(() => result.current.approveDesign());

    await waitFor(() => expect(result.current.phase).toBe("done"));
    expect(callOrder).toEqual(["approve", "publish"]);
    expect(mockApprovePreview).toHaveBeenCalledWith("site-1");
    expect(mockPublishSite).toHaveBeenCalledWith("site-1");
  });

  it("(4) approval failure does NOT call publish and surfaces a recoverable error", async () => {
    completedWithVariations();
    mockApprovePreview.mockRejectedValue(new Error("approval service down"));

    const { result } = renderHook(() => useRestaurantBuilder());
    await waitFor(() => expect(result.current.phase).toBe("review"));

    act(() => result.current.approveDesign());

    await waitFor(() => expect(result.current.phase).toBe("approve_failed"));
    expect(result.current.actionError).toBe("approval service down");
    expect(mockPublishSite).not.toHaveBeenCalled();
    expect(mockCreateTable).not.toHaveBeenCalled();
  });

  it("(5) publish failure shows a recoverable error (e.g. a pre-publish validation issue) and does not reveal success", async () => {
    completedWithVariations();
    mockApprovePreview.mockResolvedValue({ site: site() });
    mockPublishSite.mockRejectedValue(new Error("Open the full preview and approve it before publishing."));

    const { result } = renderHook(() => useRestaurantBuilder());
    await waitFor(() => expect(result.current.phase).toBe("review"));

    act(() => result.current.approveDesign());

    await waitFor(() => expect(result.current.phase).toBe("publish_failed"));
    expect(result.current.actionError).toBe("Open the full preview and approve it before publishing.");
    expect(result.current.publishedVersionId).toBeNull();
    expect(mockCreateTable).not.toHaveBeenCalled();
  });

  it("(6a) retryPublish retries ONLY publish — it does not re-approve or regenerate", async () => {
    completedWithVariations();
    mockApprovePreview.mockResolvedValue({ site: site() });
    mockPublishSite.mockRejectedValueOnce(new Error("images still processing")).mockResolvedValueOnce({ version: { id: "v-best" } });

    const { result } = renderHook(() => useRestaurantBuilder());
    await waitFor(() => expect(result.current.phase).toBe("review"));

    act(() => result.current.approveDesign());
    await waitFor(() => expect(result.current.phase).toBe("publish_failed"));
    expect(mockApprovePreview).toHaveBeenCalledTimes(1);

    act(() => result.current.retryPublish());
    await waitFor(() => expect(result.current.phase).toBe("done"));

    // Publish tried twice; approval NOT called again; generation NOT restarted.
    expect(mockPublishSite).toHaveBeenCalledTimes(2);
    expect(mockApprovePreview).toHaveBeenCalledTimes(1);
    expect(mockRegenerateVariations).not.toHaveBeenCalled();
    expect(mockStartGeneration).not.toHaveBeenCalled();
  });

  it("(6b) retryApprove retries approval+publish without regenerating the site", async () => {
    completedWithVariations();
    mockApprovePreview.mockRejectedValueOnce(new Error("transient")).mockResolvedValueOnce({ site: site() });
    mockPublishSite.mockResolvedValue({ version: { id: "v-best" } });

    const { result } = renderHook(() => useRestaurantBuilder());
    await waitFor(() => expect(result.current.phase).toBe("review"));

    act(() => result.current.approveDesign());
    await waitFor(() => expect(result.current.phase).toBe("approve_failed"));

    act(() => result.current.retryApprove());
    await waitFor(() => expect(result.current.phase).toBe("done"));

    expect(mockApprovePreview).toHaveBeenCalledTimes(2);
    expect(mockRegenerateVariations).not.toHaveBeenCalled();
    expect(mockStartGeneration).not.toHaveBeenCalled();
  });

  it("(7) success (done) appears only after publish confirms; then a QR code is provisioned", async () => {
    completedWithVariations();
    mockApprovePreview.mockResolvedValue({ site: site() });
    mockPublishSite.mockResolvedValue({ version: { id: "v-best" } });

    const { result } = renderHook(() => useRestaurantBuilder());
    await waitFor(() => expect(result.current.phase).toBe("review"));

    act(() => result.current.approveDesign());

    await waitFor(() => expect(result.current.phase).toBe("done"));
    expect(result.current.publishedVersionId).toBe("v-best");
    expect(mockCreateTable).toHaveBeenCalledWith("Scan to Order");
    expect(result.current.qrToken).toBe("tok-abc");
  });

  it("still reaches done when QR provisioning fails — QR is non-fatal, publish already succeeded", async () => {
    completedWithVariations();
    mockApprovePreview.mockResolvedValue({ site: site() });
    mockPublishSite.mockResolvedValue({ version: { id: "v-best" } });
    mockCreateTable.mockRejectedValue(new Error("table service down"));

    const { result } = renderHook(() => useRestaurantBuilder());
    await waitFor(() => expect(result.current.phase).toBe("review"));
    act(() => result.current.approveDesign());

    await waitFor(() => expect(result.current.phase).toBe("done"));
    expect(result.current.publishedVersionId).toBe("v-best");
    expect(result.current.qrToken).toBeNull();
    expect(result.current.qrError).toBe("table service down");
  });

  it("select failure is recoverable via retrySelect — without regenerating", async () => {
    mockGetMySite.mockResolvedValue({ site: site() });
    mockGetGenerationStatus.mockResolvedValue({
      job: { id: "job-1", siteId: "site-1", batchId: "b1", stage: "FINALIZE", status: "COMPLETED", error: null },
    });
    mockListVariations.mockRejectedValueOnce(new Error("no variations")).mockResolvedValueOnce({
      variations: [{ id: "v-1", scores: [{ overall: 80 }], definition: { tagline: "T", cuisine: "diner", colorSeed: "#333" } }],
    });
    mockSelectVariation.mockResolvedValue({ version: { id: "v-1" } });

    const { result } = renderHook(() => useRestaurantBuilder());
    await waitFor(() => expect(result.current.phase).toBe("select_failed"));

    act(() => result.current.retrySelect());
    await waitFor(() => expect(result.current.phase).toBe("review"));
    expect(result.current.selectedVersionId).toBe("v-1");
    expect(mockRegenerateVariations).not.toHaveBeenCalled();
  });

  it("retryGeneration (only offered on generation failure) regenerates and resumes generating", async () => {
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
