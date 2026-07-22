import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The real DevicePreview needs a live /preview iframe + token endpoint;
// stub it to a marker so we can assert which real storefront each section wires up.
vi.mock("../website/variations/[id]/device-preview", () => ({
  DevicePreview: ({ siteId, variationId, chromeless }: { siteId: string; variationId: string; chromeless?: boolean }) => (
    <div data-testid="real-preview" data-chromeless={String(!!chromeless)}>
      {siteId}:{variationId}
    </div>
  ),
}));

import { DesignReviewScreen } from "./design-review-screen";
import type { DesignCandidate } from "./use-restaurant-builder";

const NAME = "Easy Tobacco Shop";

const CANDIDATES: DesignCandidate[] = [
  { id: "v-mod", styleFamily: "MODERN", businessType: "VAPE_SHOP", restaurantName: NAME, colorSeed: "#111", palette: null, tagline: "M", cuisine: "n/a", overall: 80 },
  { id: "v-best", styleFamily: "LUXURY", businessType: "VAPE_SHOP", restaurantName: NAME, colorSeed: "#222", palette: { primary: "#1D3557" }, tagline: "Bold & premium", cuisine: "n/a", overall: 92 },
  { id: "v-min", styleFamily: "MINIMAL", businessType: "VAPE_SHOP", restaurantName: NAME, colorSeed: "#333", palette: null, tagline: "Mi", cuisine: "n/a", overall: 75 },
];

function props(overrides: Record<string, unknown> = {}) {
  return {
    restaurantName: NAME,
    siteId: "site-1",
    selectedVersionId: "v-best",
    candidates: CANDIDATES,
    switchingTheme: false,
    onUse: vi.fn(),
    phase: "review" as const,
    actionError: null as string | null,
    onRetryApprove: vi.fn(),
    onRetryPublish: vi.fn(),
    ...overrides,
  };
}

// Locked: these words must NEVER reach customer-facing UI — theme vocabulary,
// "AI", and the retired concept-tier naming system.
const BANNED = /\b(ai|theme|themes|template|templates|variation|variations|modern|luxury|local|style\s*family|prestige|reserve|signature|prime|elite|select)\b/i;

describe("DesignReviewScreen — the Storefront Showcase is the ONLY selection experience", () => {
  it("renders the full-height showcase: one complete storefront section per candidate", async () => {
    render(<DesignReviewScreen {...props()} />);
    expect(screen.getByTestId("storefront-showcase")).toBeInTheDocument();
    expect(screen.getAllByTestId("storefront-section")).toHaveLength(3);
    // LazyMount's jsdom fallback mounts on the next tick, hence async.
    const previews = await screen.findAllByTestId("real-preview");
    expect(previews).toHaveLength(3);
    previews.forEach((p) => expect(p).toHaveAttribute("data-chromeless", "true"));
  });

  it("renders no banned vocabulary and no concept-card metadata anywhere", () => {
    const { container } = render(<DesignReviewScreen {...props()} />);
    expect(container.textContent ?? "").not.toMatch(BANNED);
    expect(screen.queryByText(/Other storefronts we designed for you/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Recommended/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/See this storefront/i)).not.toBeInTheDocument();
  });

  it("orders the best-scoring storefront first — the storefront itself is the pitch", async () => {
    render(<DesignReviewScreen {...props()} />);
    const previews = (await screen.findAllByTestId("real-preview")).map((p) => p.textContent);
    expect(previews[0]).toBe("site-1:v-best");
  });

  it("every storefront carries exactly one Use This Storefront action, wired to that storefront", () => {
    const onUse = vi.fn();
    render(<DesignReviewScreen {...props({ onUse })} />);
    const buttons = screen.getAllByRole("button", { name: "Use This Storefront" });
    expect(buttons).toHaveLength(3);
    fireEvent.click(buttons[0]);
    expect(onUse).toHaveBeenCalledWith("v-best");
  });

  it("the active storefront's CTA reflects progress while approving", () => {
    render(<DesignReviewScreen {...props({ phase: "approving" })} />);
    expect(screen.getByText("Setting up…")).toBeInTheDocument();
    // The other two storefronts keep their normal CTA.
    expect(screen.getAllByRole("button", { name: "Use This Storefront" })).toHaveLength(2);
  });

  it("a failed approve surfaces the error and a retry on the active storefront", () => {
    const onRetryApprove = vi.fn();
    render(<DesignReviewScreen {...props({ phase: "approve_failed", actionError: "Boom", onRetryApprove })} />);
    expect(screen.getByText("Boom")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetryApprove).toHaveBeenCalled();
  });

  it("a failed publish offers Try publishing again", () => {
    const onRetryPublish = vi.fn();
    render(<DesignReviewScreen {...props({ phase: "publish_failed", actionError: "Nope", onRetryPublish })} />);
    fireEvent.click(screen.getByRole("button", { name: "Try publishing again" }));
    expect(onRetryPublish).toHaveBeenCalled();
  });

  it("shows a graceful message when no storefronts are available", () => {
    render(<DesignReviewScreen {...props({ candidates: [] })} />);
    expect(screen.getByText(/Preview unavailable right now/i)).toBeInTheDocument();
  });
});
