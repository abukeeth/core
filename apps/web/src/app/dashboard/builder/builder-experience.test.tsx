import "@testing-library/jest-dom/vitest";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/builder",
}));

const mockUseRestaurantBuilder = vi.fn();
vi.mock("./use-restaurant-builder", () => ({
  useRestaurantBuilder: () => mockUseRestaurantBuilder(),
}));

vi.mock("./live-build-screen", () => ({
  LiveBuildScreen: ({ activeStepId, errorMessage }: { activeStepId: string; errorMessage: string | null }) => (
    <div data-testid="live-build-screen">
      {activeStepId} {errorMessage}
    </div>
  ),
}));

vi.mock("./design-review-screen", () => ({
  DesignReviewScreen: ({ phase, selectedVersionId }: { phase: string; selectedVersionId: string | null }) => (
    <div data-testid="design-review-screen">
      {phase} {selectedVersionId}
    </div>
  ),
}));

vi.mock("./finale-reveal", () => ({
  FinaleReveal: ({ restaurantName }: { restaurantName: string }) => <div data-testid="finale-reveal">{restaurantName}</div>,
}));

import { BuilderExperience } from "./builder-experience";

function baseState(overrides: Record<string, unknown> = {}) {
  return {
    phase: "loading",
    job: null,
    siteId: null,
    siteSlug: null,
    siteDomain: null,
    publishedVersionId: null,
    candidates: [],
    selectedVersionId: null,
    winningDesign: null,
    qrToken: null,
    qrError: null,
    bootstrapError: null,
    actionError: null,
    approveDesign: vi.fn(),
    retrySelect: vi.fn(),
    retryApprove: vi.fn(),
    retryPublish: vi.fn(),
    retryGeneration: vi.fn(),
    retryBootstrap: vi.fn(),
    ...overrides,
  };
}

describe("BuilderExperience", () => {
  it("shows a loading message while bootstrapping", () => {
    mockUseRestaurantBuilder.mockReturnValue(baseState({ phase: "loading" }));
    render(<BuilderExperience restaurantName="Joe's Diner" />);
    expect(screen.getByText(/Joe's Diner/)).toBeInTheDocument();
  });

  it("renders the live build screen while generating", () => {
    mockUseRestaurantBuilder.mockReturnValue(
      baseState({ phase: "generating", job: { id: "j1", stage: "THEME_SELECTION", status: "RUNNING", error: null } }),
    );
    render(<BuilderExperience restaurantName="Joe's Diner" />);
    expect(screen.getByTestId("live-build-screen")).toHaveTextContent("THEME_SELECTION");
  });

  it("surfaces the generation error message when generation failed", () => {
    mockUseRestaurantBuilder.mockReturnValue(
      baseState({ phase: "generation_failed", job: { id: "j1", stage: "SCORING", status: "FAILED", error: "AI unavailable" } }),
    );
    render(<BuilderExperience restaurantName="Joe's Diner" />);
    expect(screen.getByTestId("live-build-screen")).toHaveTextContent("AI unavailable");
  });

  it("routes to the design review (approval) gate once a design is selected — NOT a finale", () => {
    mockUseRestaurantBuilder.mockReturnValue(baseState({ phase: "review", siteId: "site-1", selectedVersionId: "v-best" }));
    render(<BuilderExperience restaurantName="Joe's Diner" />);
    expect(screen.getByTestId("design-review-screen")).toHaveTextContent("review v-best");
    expect(screen.queryByTestId("finale-reveal")).not.toBeInTheDocument();
  });

  it("keeps rendering the review screen during approving and publishing (no premature finale)", () => {
    for (const phase of ["approving", "approve_failed", "publishing", "publish_failed"]) {
      mockUseRestaurantBuilder.mockReturnValue(baseState({ phase, siteId: "site-1", selectedVersionId: "v-best" }));
      const { unmount } = render(<BuilderExperience restaurantName="Joe's Diner" />);
      expect(screen.getByTestId("design-review-screen")).toHaveTextContent(phase);
      expect(screen.queryByTestId("finale-reveal")).not.toBeInTheDocument();
      unmount();
    }
  });

  describe("the reveal beat", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("holds on a published-but-not-yet-revealed beat before the finale — with no finale shown yet", () => {
      mockUseRestaurantBuilder.mockReturnValue(baseState({ phase: "done", siteId: "site-1", siteSlug: "joes" }));
      render(<BuilderExperience restaurantName="Joe's Diner" />);

      expect(screen.getByText(/Your website is published/)).toBeInTheDocument();
      expect(screen.queryByTestId("finale-reveal")).not.toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(700);
      });

      expect(screen.getByTestId("finale-reveal")).toHaveTextContent("Joe's Diner");
    });
  });

  it("shows a bootstrap error with a retry button", () => {
    mockUseRestaurantBuilder.mockReturnValue(baseState({ phase: "bootstrap_failed", bootstrapError: "Network down" }));
    render(<BuilderExperience restaurantName="Joe's Diner" />);
    expect(screen.getByText("Network down")).toBeInTheDocument();
    expect(screen.getByText("Try again")).toBeInTheDocument();
  });
});
