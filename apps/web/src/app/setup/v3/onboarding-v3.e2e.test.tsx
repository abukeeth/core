import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Onboarding V3 — end-to-end integration. Drives the REAL container and the
 * real Create / Analysis-Review / Confirm screens through both full paths
 * (AI import + Manual/Skip) and the key resume points, against a stateful
 * in-memory API. Only genuine leaves are stubbed: the heavy ReviewEditor
 * (its own unit test covers it) and on-device image downscaling.
 */

// --- stateful fake backend --------------------------------------------------
type Store = { id: string; name: string; address: string | null; businessType: string; setupStep: string } | null;
let store: Store;
let jobs: { id: string; status: string; extractedData: unknown; errorMessage: string | null; createdAt: string }[];

const apiError = (status: number) => Object.assign(new Error(`http ${status}`), { __api: true, status });
const mkJob = (status: string) => ({ id: "job-1", status, extractedData: { categories: [] }, errorMessage: null, createdAt: new Date().toISOString() });

const mockReplace = vi.fn();
// A STABLE router — the real next/navigation useRouter returns a stable
// reference, so the container's runLoad effect (keyed on `router`) runs once.
// A fresh object per call would re-fire runLoad on every render and clobber
// in-flight stage transitions (e.g. approve → confirm).
const stableRouter = { replace: mockReplace, push: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => stableRouter }));
vi.mock("@/lib/image-downscale", () => ({ downscaleImageFile: (f: File) => Promise.resolve(f) }));
// ReviewEditor is a leaf with its own test — stub it to emit approve/reject.
// Approving mirrors the backend: the job flips to APPROVED (the real editor
// calls approveImportJob), so a resume after approve derives Confirm, not Review.
vi.mock("../../dashboard/import/[id]/review-editor", () => ({
  ReviewEditor: ({ onApproved, onRejected }: { onApproved: () => void; onRejected: () => void }) => (
    <div>
      <span>Review Editor</span>
      <button
        type="button"
        onClick={() => {
          jobs = [mkJob("APPROVED")];
          onApproved();
        }}
      >
        approve-menu
      </button>
      <button type="button" onClick={onRejected}>reject-menu</button>
    </div>
  ),
}));
vi.mock("../../dashboard/import/import-hub", () => ({ ProgressCard: () => <div>Progress</div> }));

vi.mock("@/lib/api", () => ({
  isApiRequestError: (e: unknown) => Boolean(e && typeof e === "object" && "__api" in e),
  getRestaurant: () => (store ? Promise.resolve({ restaurant: store }) : Promise.reject(apiError(404))),
  createRestaurant: ({ businessType }: { businessType: string }) => {
    store = { id: "r1", name: "My Business", address: null, businessType, setupStep: "BUSINESS_INFO" };
    return Promise.resolve({ restaurant: store });
  },
  updateRestaurant: (input: Record<string, unknown>) => {
    store = { ...(store as NonNullable<Store>), ...input };
    return Promise.resolve({ restaurant: store });
  },
  setSetupStep: (setupStep: string) => {
    if (store) store = { ...store, setupStep };
    return Promise.resolve({ restaurant: store });
  },
  listImportJobs: () => Promise.resolve({ jobs }),
  getImportJob: (id: string) => Promise.resolve({ job: jobs.find((j) => j.id === id) ?? mkJob("AWAITING_REVIEW") }),
  createConsolidatedImport: () => {
    // In production this returns PENDING and the screen polls to AWAITING_REVIEW
    // (covered by analysis-review-screen.test); here it lands AWAITING_REVIEW so
    // the E2E runs on real timers.
    const job = mkJob("AWAITING_REVIEW");
    jobs = [job];
    return Promise.resolve({ job });
  },
}));

import { OnboardingV3 } from "./onboarding-v3";

beforeEach(() => {
  vi.clearAllMocks();
  store = null;
  jobs = [];
});

async function pickTypeAndName(name: string) {
  // Confirm screen: wait for prefill, set the name, confirm.
  const nameInput = await screen.findByPlaceholderText(/Marlowe/);
  fireEvent.change(nameInput, { target: { value: name } });
  fireEvent.change(screen.getByPlaceholderText("Street, city, state"), { target: { value: "1 Main St" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm & build my storefront" }));
}

describe("V3 E2E — Manual/Skip path (no source, no AI)", () => {
  it("create → skip → confirm details → build handoff", async () => {
    render(<OnboardingV3 />);
    await screen.findByText("Let's build your storefront");

    fireEvent.click(screen.getByRole("button", { name: /Pizza/ }));
    fireEvent.click(screen.getByRole("button", { name: "Skip — I'll add my menu manually" }));

    // Lands on Confirm details (store created, no import ever called).
    await pickTypeAndName("Forno Rossi");

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/dashboard/builder"));
    expect(store).toMatchObject({ name: "Forno Rossi", address: "1 Main St", setupStep: "DONE" });
  });
});

describe("V3 E2E — AI import path", () => {
  it("create → analyze → review approve → confirm details → build handoff", async () => {
    render(<OnboardingV3 />);
    await screen.findByText("Let's build your storefront");

    fireEvent.click(screen.getByRole("button", { name: /Restaurant/ }));
    fireEvent.change(screen.getByPlaceholderText("https://your-restaurant.com"), { target: { value: "https://x.example" } });
    fireEvent.click(screen.getByRole("button", { name: "Analyze My Business" }));

    // Review step (real AnalysisReviewScreen, stubbed ReviewEditor).
    await screen.findByText("Review Editor");
    fireEvent.click(screen.getByRole("button", { name: "approve-menu" }));

    // Confirm details, then build.
    await pickTypeAndName("Bella");
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/dashboard/builder"));
    expect(store).toMatchObject({ name: "Bella", setupStep: "DONE" });
  });
});

describe("V3 E2E — resume at each stage (data-driven, real screens)", () => {
  it("fresh (no store) → Create", async () => {
    render(<OnboardingV3 />);
    await screen.findByText("Let's build your storefront");
  });

  it("store exists, no import → Create", async () => {
    store = { id: "r1", name: "My Business", address: null, businessType: "PIZZA", setupStep: "BUSINESS_INFO" };
    jobs = [];
    render(<OnboardingV3 />);
    await screen.findByText("Let's build your storefront");
  });

  it("import still processing → Review (analyzing)", async () => {
    store = { id: "r1", name: "My Business", address: null, businessType: "PIZZA", setupStep: "BUSINESS_INFO" };
    jobs = [mkJob("PROCESSING")];
    render(<OnboardingV3 />);
    await screen.findByText("Reading your menu…");
  });

  it("import awaiting review → Review editor", async () => {
    store = { id: "r1", name: "My Business", address: null, businessType: "PIZZA", setupStep: "BUSINESS_INFO" };
    jobs = [mkJob("AWAITING_REVIEW")];
    render(<OnboardingV3 />);
    await screen.findByText("Review Editor");
  });

  it("menu approved but not DONE → Confirm details (prefilled)", async () => {
    store = { id: "r1", name: "My Business", address: null, businessType: "PIZZA", setupStep: "BUSINESS_INFO" };
    jobs = [mkJob("APPROVED")];
    render(<OnboardingV3 />);
    await screen.findByText("Last thing — your name & address");
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("already DONE → straight to builder", async () => {
    store = { id: "r1", name: "Bella", address: "1 Main St", businessType: "PIZZA", setupStep: "DONE" };
    render(<OnboardingV3 />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/dashboard/builder"));
  });
});
