import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/builder" }));

// The real DevicePreview needs a live /preview iframe + token endpoint;
// stub it to a marker so we can assert the review screen wires the correct
// selected version into the real-preview slot.
vi.mock("../website/variations/[id]/device-preview", () => ({
  DevicePreview: ({ siteId, variationId }: { siteId: string; variationId: string }) => (
    <div data-testid="real-preview">
      {siteId}:{variationId}
    </div>
  ),
}));

import { DesignReviewScreen } from "./design-review-screen";
import type { DesignCandidate } from "./use-restaurant-builder";

// VAPE_SHOP so concept names resolve to the curated trio (Flagship/Showcase/Corner Shop).
const CANDIDATES: DesignCandidate[] = [
  { id: "v-mod", styleFamily: "MODERN", businessType: "VAPE_SHOP", colorSeed: "#111", tagline: "M", cuisine: "n/a", overall: 80 },
  { id: "v-best", styleFamily: "LUXURY", businessType: "VAPE_SHOP", colorSeed: "#222", tagline: "L", cuisine: "n/a", overall: 92 },
  { id: "v-min", styleFamily: "MINIMAL", businessType: "VAPE_SHOP", colorSeed: "#333", tagline: "Mi", cuisine: "n/a", overall: 75 },
];

function props(overrides: Record<string, unknown> = {}) {
  return {
    restaurantName: "Easy Tobacco Shop",
    siteId: "site-1",
    selectedVersionId: "v-best",
    candidates: CANDIDATES,
    switchingTheme: false,
    onSelectTheme: vi.fn(),
    phase: "review" as const,
    actionError: null as string | null,
    onApprove: vi.fn(),
    onRetryApprove: vi.fn(),
    onRetryPublish: vi.fn(),
    ...overrides,
  };
}

// Principle 2 (locked): these words must NEVER reach customer-facing UI.
const BANNED = /\b(theme|template|variation|modern|luxury|local|style\s*family)\b/i;

describe("DesignReviewScreen (storefront concept approval gate)", () => {
  it("renders no banned theme/template vocabulary anywhere in the DOM", () => {
    const { container } = render(<DesignReviewScreen {...props()} />);
    expect(container.textContent ?? "").not.toMatch(BANNED);
  });

  it("shows the REAL preview of the selected storefront (not the build mockup)", () => {
    render(<DesignReviewScreen {...props()} />);
    expect(screen.getByTestId("real-preview")).toHaveTextContent("site-1:v-best");
  });

  it("review: shows 'Use this storefront' and fires onApprove when clicked", () => {
    const onApprove = vi.fn();
    render(<DesignReviewScreen {...props({ onApprove })} />);
    fireEvent.click(screen.getByRole("button", { name: "Use this storefront" }));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it("review: offers a safe 'See your other storefronts' link (no auto-publish)", () => {
    render(<DesignReviewScreen {...props()} />);
    const link = screen.getByRole("link", { name: "See your other storefronts" });
    expect(link).toHaveAttribute("href", "/dashboard/website/variations");
  });

  it("shows NO premature success claim at the review gate (nothing is public yet)", () => {
    render(<DesignReviewScreen {...props()} />);
    expect(screen.queryByText(/open for business/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/you're live/i)).not.toBeInTheDocument();
    expect(screen.getByText(/nothing is public yet/i)).toBeInTheDocument();
  });

  it("approving: shows an in-progress state and hides the primary action", () => {
    render(<DesignReviewScreen {...props({ phase: "approving" })} />);
    expect(screen.getByText(/Setting up your storefront/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use this storefront" })).not.toBeInTheDocument();
  });

  it("publishing: shows a publishing-in-progress state (still no 'live' claim)", () => {
    render(<DesignReviewScreen {...props({ phase: "publishing" })} />);
    expect(screen.getByText(/Publishing your storefront/)).toBeInTheDocument();
    expect(screen.queryByText(/open for business/i)).not.toBeInTheDocument();
  });

  it("approve_failed: surfaces the error and a 'Try again' retry", () => {
    const onRetryApprove = vi.fn();
    render(<DesignReviewScreen {...props({ phase: "approve_failed", actionError: "approval service down", onRetryApprove })} />);
    expect(screen.getByText("approval service down")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetryApprove).toHaveBeenCalledTimes(1);
  });

  it("publish_failed: surfaces the readiness error and a 'Try publishing again' retry (publish-only)", () => {
    const onRetryPublish = vi.fn();
    render(
      <DesignReviewScreen
        {...props({ phase: "publish_failed", actionError: "Open the full preview and approve it before publishing.", onRetryPublish })}
      />,
    );
    expect(screen.getByText("Open the full preview and approve it before publishing.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try publishing again" }));
    expect(onRetryPublish).toHaveBeenCalledTimes(1);
  });

  it("preview unavailable: shows a clear message and disables the action when nothing is selected", () => {
    render(<DesignReviewScreen {...props({ selectedVersionId: null })} />);
    expect(screen.getByText(/Preview unavailable right now/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use this storefront" })).toBeDisabled();
  });

  describe("storefront concept picker", () => {
    it("renders one option per generated concept, by business-oriented name", () => {
      render(<DesignReviewScreen {...props()} />);
      const group = screen.getByRole("group", { name: "Storefront concepts" });
      const names = within(group)
        .getAllByRole("button")
        .map((b) => b.textContent?.replace("Recommended", "").trim());
      // Recommended (highest score = v-best LUXURY) first, then by score.
      expect(names).toEqual(["The Flagship", "The Showcase", "The Corner Shop"]);
    });

    it("marks the highest-scoring concept as recommended and pressed", () => {
      render(<DesignReviewScreen {...props()} />);
      expect(screen.getByText("Recommended")).toBeInTheDocument();
      const flagship = screen.getByRole("button", { name: /The Flagship/ });
      expect(flagship).toHaveAttribute("aria-pressed", "true");
    });

    it("fires onSelectTheme with the chosen concept's id", () => {
      const onSelectTheme = vi.fn();
      render(<DesignReviewScreen {...props({ onSelectTheme })} />);
      fireEvent.click(screen.getByRole("button", { name: /The Corner Shop/ }));
      expect(onSelectTheme).toHaveBeenCalledWith("v-min");
    });

    it("shows the selected concept's name and description", () => {
      render(<DesignReviewScreen {...props()} />);
      expect(screen.getByRole("heading", { name: "The Flagship" })).toBeInTheDocument();
      expect(screen.getByText(/puts your products front and center/i)).toBeInTheDocument();
    });

    it("disables the concept options while a switch is applying", () => {
      render(<DesignReviewScreen {...props({ switchingTheme: true })} />);
      expect(screen.getByRole("button", { name: /The Showcase/ })).toBeDisabled();
      expect(screen.getByText(/Applying…/)).toBeInTheDocument();
    });
  });
});
