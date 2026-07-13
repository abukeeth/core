import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WebsiteSiteDefinition } from "@/lib/api";

const mockRenderDraftPreview = vi.fn();
vi.mock("@/lib/api", () => ({
  renderDraftPreview: (...args: unknown[]) => mockRenderDraftPreview(...args),
}));

import { LivePreview } from "./live-preview";

function definition(): WebsiteSiteDefinition {
  return {
    schemaVersion: 1,
    restaurantName: "Trattoria Bella",
    tagline: "Handmade pasta",
    cuisine: "italian",
    businessType: "bistro",
    styleFamily: "MODERN",
    themeKey: "modern-bistro",
    themeVersion: 1,
    colorSeed: "#e8590c",
    typography: { display: "Sora", body: "Inter" },
    facts: { restaurantName: "Trattoria Bella", hasOnlineOrdering: false, hasReservations: false },
    pages: [{ slug: "/", title: "Home", metaDescription: "x", sections: [] }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRenderDraftPreview.mockResolvedValue({ html: "<html></html>" });
});

describe("LivePreview — §Website Builder PREVIEW_APPROVED (§5/§6)", () => {
  it("defaults to the mobile viewport", () => {
    render(<LivePreview siteId="site-1" definition={definition()} activePath="/" approved={false} onApprove={vi.fn()} />);

    expect(screen.getByLabelText("Mobile")).toHaveAttribute("aria-pressed", "true");
  });

  it("shows an 'Approve preview' button when not yet approved, and calls onApprove when clicked", async () => {
    const onApprove = vi.fn().mockResolvedValue(undefined);
    render(<LivePreview siteId="site-1" definition={definition()} activePath="/" approved={false} onApprove={onApprove} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Approve preview" })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Approve preview" }));

    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
  });

  it("shows an approved badge instead of the button once approved", () => {
    render(<LivePreview siteId="site-1" definition={definition()} activePath="/" approved onApprove={vi.fn()} />);

    expect(screen.getByText("Preview approved")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve preview" })).not.toBeInTheDocument();
  });
});
