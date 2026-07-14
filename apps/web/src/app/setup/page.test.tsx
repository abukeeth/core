import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetRestaurant = vi.fn();
const mockReplace = vi.fn();

vi.mock("@/lib/api", () => ({
  getRestaurant: (...args: unknown[]) => mockGetRestaurant(...args),
  // A crafted error carries __api:true; page reads err.status off it.
  isApiRequestError: (err: unknown) => Boolean(err && typeof err === "object" && "__api" in err),
}));

// A stable router object across renders, matching real next/navigation
// (whose useRouter reference is memoized). A fresh object each render would
// make the page's useCallback/useEffect deps churn and refetch on loop.
const stableRouter = { replace: mockReplace, push: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => stableRouter,
}));

// Stub every step so the page's routing logic can be tested in isolation
// (and to keep each step's own import graph out of this test).
vi.mock("./steps/business-type-step", () => ({ BusinessTypeStep: () => <div>Business Type Step</div> }));
vi.mock("./steps/business-info-step", () => ({ BusinessInfoStep: () => <div>Business Info Step</div> }));
vi.mock("./steps/location-step", () => ({ LocationStep: () => <div>Location Step</div> }));
vi.mock("./steps/payment-provider-step", () => ({ PaymentProviderStep: () => <div>Payment Step</div> }));
vi.mock("./steps/menu-import-step", () => ({ MenuImportStep: () => <div>Menu Step</div> }));
vi.mock("./steps/website-theme-step", () => ({ WebsiteThemeStep: () => <div>Website Step</div> }));
vi.mock("./steps/finish-step", () => ({ FinishStep: () => <div>Finish Step</div> }));

import BusinessSetupWizardPage from "./page";

function apiError(status: number) {
  return { __api: true, status };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BusinessSetupWizardPage — Priority 1: transient load failures must not masquerade as a brand-new owner", () => {
  it("shows Business Type only on a definitive 404 (genuinely no business yet)", async () => {
    mockGetRestaurant.mockRejectedValue(apiError(404));
    render(<BusinessSetupWizardPage />);

    await waitFor(() => expect(screen.getByText("Business Type Step")).toBeInTheDocument());
  });

  it("shows a retry state (not Business Type) on a transient 5xx failure", async () => {
    mockGetRestaurant.mockRejectedValue(apiError(503));
    render(<BusinessSetupWizardPage />);

    await waitFor(() => expect(screen.getByText("We couldn't load your setup")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByText("Business Type Step")).not.toBeInTheDocument();
  });

  it("shows a retry state (not Business Type) on a network/plain error", async () => {
    mockGetRestaurant.mockRejectedValue(new Error("Couldn't reach the server"));
    render(<BusinessSetupWizardPage />);

    await waitFor(() => expect(screen.getByText("We couldn't load your setup")).toBeInTheDocument());
    expect(screen.queryByText("Business Type Step")).not.toBeInTheDocument();
  });

  it("redirects to /login on a 401", async () => {
    mockGetRestaurant.mockRejectedValue(apiError(401));
    render(<BusinessSetupWizardPage />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/login"));
  });

  it("resumes at the persisted step on success", async () => {
    mockGetRestaurant.mockResolvedValue({ restaurant: { setupStep: "LOCATION" } });
    render(<BusinessSetupWizardPage />);

    await waitFor(() => expect(screen.getByText("Location Step")).toBeInTheDocument());
  });

  it("recovers after the owner retries a transient failure", async () => {
    mockGetRestaurant.mockRejectedValueOnce(apiError(503)).mockResolvedValueOnce({ restaurant: { setupStep: "LOCATION" } });
    render(<BusinessSetupWizardPage />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(screen.getByText("Location Step")).toBeInTheDocument());
    expect(mockGetRestaurant).toHaveBeenCalledTimes(2);
  });
});
