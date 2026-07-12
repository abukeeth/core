import "@testing-library/jest-dom/vitest";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/builder",
}));

import { LiveBuildScreen } from "./live-build-screen";

describe("LiveBuildScreen", () => {
  it("shows the restaurant name and grouped build progress", () => {
    render(<LiveBuildScreen restaurantName="Joe's Diner" activeStepId="ASSEMBLY" />);

    expect(screen.getByRole("heading", { name: "Building Joe's Diner" })).toBeInTheDocument();
    expect(screen.getByText("Understanding your restaurant")).toBeInTheDocument();
    expect(screen.getByText("Designing your website")).toBeInTheDocument();
    expect(screen.getByText("Publishing your business")).toBeInTheDocument();
  });

  it("shows the error message and retry button when one is provided", () => {
    const onRetry = () => {};
    render(
      <LiveBuildScreen restaurantName="Joe's Diner" activeStepId="BRAND_ANALYSIS" errorMessage="AI unavailable" onRetry={onRetry} />,
    );

    expect(screen.getByText("AI unavailable")).toBeInTheDocument();
    expect(screen.getByText("Try again")).toBeInTheDocument();
  });

  it("does not show a retry button when none is provided", () => {
    render(<LiveBuildScreen restaurantName="Joe's Diner" activeStepId="THEME_SELECTION" />);
    expect(screen.queryByText("Try again")).not.toBeInTheDocument();
  });

  it("personalizes the caption with the restaurant name", () => {
    render(<LiveBuildScreen restaurantName="Joe's Diner" activeStepId="INGEST" />);
    expect(screen.getByText(/Joe's Diner's menu and profile/)).toBeInTheDocument();
  });

  it("shows grouped build stages with completion state", () => {
    render(<LiveBuildScreen restaurantName="Joe's Diner" activeStepId="PUBLISHING" />);

    expect(screen.getByText("Understanding your restaurant")).toBeInTheDocument();
    expect(screen.getByText("Designing your website")).toBeInTheDocument();
    expect(screen.getByText("Publishing your business")).toBeInTheDocument();
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
  });

  it("dramatizes the choice with candidate cards during SELECTING instead of the generic mockup", () => {
    vi.useFakeTimers();
    render(
      <LiveBuildScreen
        restaurantName="Joe's Diner"
        activeStepId="SELECTING"
        candidates={[
          { id: "v-1", colorSeed: "#111111", overall: 60 },
          { id: "v-2", colorSeed: "#e8590c", overall: 92 },
        ]}
        winnerId="v-2"
      />,
    );

    act(() => {
      vi.advanceTimersByTime(700);
    });

    expect(screen.getByText("Your best fit")).toBeInTheDocument();
    vi.useRealTimers();
  });

  describe("rotating captions", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("rotates the active stage caption over time", () => {
      render(<LiveBuildScreen restaurantName="Joe's Diner" activeStepId="INGEST" />);
      expect(screen.getByText("Reading Joe's Diner's menu and profile…")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(2200);
      });

      expect(screen.getByText("Organizing your categories and items…")).toBeInTheDocument();
    });
  });
});
