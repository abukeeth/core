import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WebsiteStatusCard } from "./website-status-card";

describe("WebsiteStatusCard — §7: must not contradict WebsiteDesignStatus's 'No designs generated yet'", () => {
  it("says nothing has started yet when there's no site, not that a foundation is 'ready'", () => {
    render(<WebsiteStatusCard restaurantName="Joe's Diner" status={null} />);

    expect(screen.queryByText(/foundation is ready/)).not.toBeInTheDocument();
    expect(screen.getByText(/doesn't have a storefront yet/)).toBeInTheDocument();
  });

  it("shows Live once the site is actually PUBLISHED", () => {
    render(<WebsiteStatusCard restaurantName="Joe's Diner" status="PUBLISHED" />);

    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  it("shows a clear failed-publish state, distinct from Live", () => {
    render(<WebsiteStatusCard restaurantName="Joe's Diner" status="FAILED" />);

    expect(screen.getByText("Publish failed")).toBeInTheDocument();
    expect(screen.queryByText("Live")).not.toBeInTheDocument();
  });
});
