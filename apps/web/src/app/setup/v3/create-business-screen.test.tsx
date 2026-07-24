import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateRestaurant = vi.fn();
const mockUpdateRestaurant = vi.fn();
const mockCreateConsolidatedImport = vi.fn();

vi.mock("@/lib/api", () => ({
  createRestaurant: (...args: unknown[]) => mockCreateRestaurant(...args),
  updateRestaurant: (...args: unknown[]) => mockUpdateRestaurant(...args),
  createConsolidatedImport: (...args: unknown[]) => mockCreateConsolidatedImport(...args),
}));

// Downscale is exercised elsewhere; here it must pass images through untouched.
vi.mock("@/lib/image-downscale", () => ({
  downscaleImageFile: (file: File) => Promise.resolve(file),
}));

import { CreateBusinessScreen } from "./create-business-screen";
import type { ImportJob, Restaurant } from "@/lib/api";

function restaurant(overrides: Partial<Restaurant> = {}): Restaurant {
  return {
    id: "rest-1",
    ownerId: "owner-1",
    name: "Test",
    businessType: "RESTAURANT",
    setupStep: "BUSINESS_TYPE",
    description: null,
    address: null,
    lat: null,
    lng: null,
    phone: null,
    isPublished: false,
    isSuspended: false,
    suspendedReason: null,
    referralCode: null,
    ...overrides,
  };
}

function job(): ImportJob {
  return { id: "job-1", sourceType: "MULTI", status: "PENDING", extractedData: null, errorMessage: null, createdAt: new Date().toISOString() };
}

function fileInput(): HTMLInputElement {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateRestaurant.mockResolvedValue({ restaurant: restaurant() });
  mockUpdateRestaurant.mockResolvedValue({ restaurant: restaurant({ businessType: "PIZZA" }) });
  mockCreateConsolidatedImport.mockResolvedValue({ job: job() });
});

describe("CreateBusinessScreen", () => {
  it("keeps Analyze disabled until a business type AND a source are provided", () => {
    render(<CreateBusinessScreen restaurant={null} onAnalyzed={vi.fn()} onSkip={vi.fn()} />);
    const analyze = screen.getByRole("button", { name: "Analyze My Business" });
    expect(analyze).toBeDisabled();

    // Type alone isn't enough…
    fireEvent.click(screen.getByRole("button", { name: /Pizza/ }));
    expect(analyze).toBeDisabled();

    // …a source unlocks it.
    fireEvent.change(screen.getByPlaceholderText("https://your-restaurant.com"), {
      target: { value: "https://slice.example" },
    });
    expect(analyze).toBeEnabled();
  });

  it("creates the store then one consolidated import job, and hands off", async () => {
    const onAnalyzed = vi.fn();
    render(<CreateBusinessScreen restaurant={null} onAnalyzed={onAnalyzed} onSkip={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Pizza/ }));
    fireEvent.change(screen.getByPlaceholderText("https://your-restaurant.com"), {
      target: { value: "https://slice.example" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Analyze My Business" }));

    await waitFor(() => expect(onAnalyzed).toHaveBeenCalledTimes(1));
    expect(mockCreateRestaurant).toHaveBeenCalledWith({ businessType: "PIZZA" });
    expect(mockCreateConsolidatedImport).toHaveBeenCalledWith(
      expect.objectContaining({ websiteUrl: "https://slice.example", googleMapsUrl: undefined }),
    );
  });

  it("reuses an existing store (never re-creates) and updates type only when it changed", async () => {
    const onAnalyzed = vi.fn();
    render(<CreateBusinessScreen restaurant={restaurant({ businessType: "RESTAURANT" })} onAnalyzed={onAnalyzed} onSkip={vi.fn()} />);

    // Switch the pre-selected type from Restaurant to Pizza, then analyze.
    fireEvent.click(screen.getByRole("button", { name: /Pizza/ }));
    fireEvent.change(screen.getByPlaceholderText("https://your-restaurant.com"), {
      target: { value: "https://slice.example" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Analyze My Business" }));

    await waitFor(() => expect(onAnalyzed).toHaveBeenCalledTimes(1));
    expect(mockCreateRestaurant).not.toHaveBeenCalled();
    expect(mockUpdateRestaurant).toHaveBeenCalledWith({ businessType: "PIZZA" });
  });

  it("sends uploaded files through to the consolidated import", async () => {
    const onAnalyzed = vi.fn();
    render(<CreateBusinessScreen restaurant={null} onAnalyzed={onAnalyzed} onSkip={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Restaurant/ }));
    const menu = new File(["bytes"], "menu.jpg", { type: "image/jpeg" });
    fireEvent.change(fileInput(), { target: { files: [menu] } });

    expect(screen.getByText("menu.jpg")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Analyze My Business" }));

    await waitFor(() => expect(mockCreateConsolidatedImport).toHaveBeenCalledTimes(1));
    const arg = mockCreateConsolidatedImport.mock.calls[0]![0] as { files: File[] };
    expect(arg.files).toHaveLength(1);
    expect(arg.files[0]!.name).toBe("menu.jpg");
  });

  it("surfaces an analyze failure and stays on the screen for a retry", async () => {
    mockCreateConsolidatedImport.mockRejectedValueOnce(new Error("Upload at least one source"));
    render(<CreateBusinessScreen restaurant={null} onAnalyzed={vi.fn()} onSkip={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Restaurant/ }));
    fireEvent.change(screen.getByPlaceholderText("https://your-restaurant.com"), {
      target: { value: "https://x.example" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Analyze My Business" }));

    await waitFor(() => expect(screen.getByText("Upload at least one source")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Analyze My Business" })).toBeEnabled();
  });

  describe("Skip — manual menu (no AI required)", () => {
    const skipName = "Skip — I'll add my menu manually";

    it("needs a business type but NO source, and creates the store then hands off to build", async () => {
      const onSkip = vi.fn();
      render(<CreateBusinessScreen restaurant={null} onAnalyzed={vi.fn()} onSkip={onSkip} />);

      // Disabled until a business type is chosen (no source needed).
      expect(screen.getByRole("button", { name: skipName })).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: /Pizza/ }));
      expect(screen.getByRole("button", { name: skipName })).toBeEnabled();

      fireEvent.click(screen.getByRole("button", { name: skipName }));

      await waitFor(() => expect(onSkip).toHaveBeenCalledTimes(1));
      expect(mockCreateRestaurant).toHaveBeenCalledWith({ businessType: "PIZZA" });
      // Skip never touches the AI import.
      expect(mockCreateConsolidatedImport).not.toHaveBeenCalled();
    });

    it("reuses an existing store on skip (never re-creates)", async () => {
      const onSkip = vi.fn();
      render(<CreateBusinessScreen restaurant={restaurant({ businessType: "RESTAURANT" })} onAnalyzed={vi.fn()} onSkip={onSkip} />);

      fireEvent.click(screen.getByRole("button", { name: skipName }));

      await waitFor(() => expect(onSkip).toHaveBeenCalledTimes(1));
      expect(mockCreateRestaurant).not.toHaveBeenCalled();
    });
  });
});
