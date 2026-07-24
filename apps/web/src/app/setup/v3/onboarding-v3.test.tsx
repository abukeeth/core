import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetRestaurant = vi.fn();
const mockListImportJobs = vi.fn();
const mockSetSetupStep = vi.fn();
const mockReplace = vi.fn();

vi.mock("@/lib/api", () => ({
  getRestaurant: (...args: unknown[]) => mockGetRestaurant(...args),
  listImportJobs: (...args: unknown[]) => mockListImportJobs(...args),
  setSetupStep: (...args: unknown[]) => mockSetSetupStep(...args),
  isApiRequestError: (err: unknown) => Boolean(err && typeof err === "object" && "__api" in err),
}));

const stableRouter = { replace: mockReplace, push: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => stableRouter }));

// Stub the screens so this test targets the container's stage derivation only.
vi.mock("./create-business-screen", () => ({ CreateBusinessScreen: () => <div>Create Screen</div> }));
vi.mock("./analysis-review-screen", () => ({ AnalysisReviewScreen: () => <div>Review Screen</div> }));
vi.mock("./confirm-details-screen", () => ({ ConfirmDetailsScreen: () => <div>Confirm Screen</div> }));

import { OnboardingV3 } from "./onboarding-v3";
import type { ImportJob, Restaurant } from "@/lib/api";

function apiError(status: number) {
  return { __api: true, status };
}

function restaurant(overrides: Partial<Restaurant> = {}): Restaurant {
  return {
    id: "rest-1",
    ownerId: "owner-1",
    name: "Bella",
    businessType: "PIZZA",
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

function job(status: ImportJob["status"]): ImportJob {
  return { id: "job-1", sourceType: "MULTI", status, extractedData: null, errorMessage: null, createdAt: new Date().toISOString() };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListImportJobs.mockResolvedValue({ jobs: [] });
  mockSetSetupStep.mockResolvedValue({ restaurant: restaurant({ setupStep: "DONE" }) });
});

describe("OnboardingV3 — data-driven resume", () => {
  it("shows Create when the owner has no store yet (definitive 404)", async () => {
    mockGetRestaurant.mockRejectedValue(apiError(404));
    render(<OnboardingV3 />);
    await waitFor(() => expect(screen.getByText("Create Screen")).toBeInTheDocument());
  });

  it("shows Create when a store exists but no import has been started", async () => {
    mockGetRestaurant.mockResolvedValue({ restaurant: restaurant() });
    mockListImportJobs.mockResolvedValue({ jobs: [] });
    render(<OnboardingV3 />);
    await waitFor(() => expect(screen.getByText("Create Screen")).toBeInTheDocument());
  });

  it("resumes at Review when an import job is still awaiting review", async () => {
    mockGetRestaurant.mockResolvedValue({ restaurant: restaurant() });
    mockListImportJobs.mockResolvedValue({ jobs: [job("AWAITING_REVIEW")] });
    render(<OnboardingV3 />);
    await waitFor(() => expect(screen.getByText("Review Screen")).toBeInTheDocument());
  });

  it("hands off to the builder when onboarding is already DONE", async () => {
    mockGetRestaurant.mockResolvedValue({ restaurant: restaurant({ setupStep: "DONE" }) });
    render(<OnboardingV3 />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/dashboard/builder"));
    expect(mockListImportJobs).not.toHaveBeenCalled();
  });

  it("resumes at Confirm details (not straight to build) when the menu is already approved but not yet DONE", async () => {
    mockGetRestaurant.mockResolvedValue({ restaurant: restaurant() });
    mockListImportJobs.mockResolvedValue({ jobs: [job("APPROVED")] });
    render(<OnboardingV3 />);
    await waitFor(() => expect(screen.getByText("Confirm Screen")).toBeInTheDocument());
    // Not yet handed off — DONE + redirect only happen after details are confirmed.
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockSetSetupStep).not.toHaveBeenCalled();
  });

  it("shows a retry state (never Create) on a transient load failure", async () => {
    mockGetRestaurant.mockRejectedValue(apiError(503));
    render(<OnboardingV3 />);
    await waitFor(() => expect(screen.getByText("We couldn't load your setup")).toBeInTheDocument());
    expect(screen.queryByText("Create Screen")).not.toBeInTheDocument();

    // Recovers on retry.
    mockGetRestaurant.mockRejectedValueOnce(apiError(404));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("Create Screen")).toBeInTheDocument());
  });

  it("redirects to /login on a 401", async () => {
    mockGetRestaurant.mockRejectedValue(apiError(401));
    render(<OnboardingV3 />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/login"));
  });
});
