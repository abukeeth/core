import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/builder" }));

// The real DevicePreview needs a live /preview iframe + token endpoint;
// stub it to a marker so we can assert which real preview each card wires up.
vi.mock("../website/variations/[id]/device-preview", () => ({
  DevicePreview: ({ siteId, variationId }: { siteId: string; variationId: string }) => (
    <div data-testid="real-preview">
      {siteId}:{variationId}
    </div>
  ),
}));

import { DesignReviewScreen } from "./design-review-screen";
import { storefrontConcept } from "@/lib/storefront-concepts";
import type { DesignCandidate } from "./use-restaurant-builder";

const NAME = "Easy Tobacco Shop";
const REC_NAME = storefrontConcept(NAME, 0).name; // "Easy Tobacco Prestige"
const MID_NAME = storefrontConcept(NAME, 1).name; // "Easy Tobacco <middle tier>"
const LAST_NAME = storefrontConcept(NAME, 2).name; // "Easy Tobacco Signature"

const CANDIDATES: DesignCandidate[] = [
  { id: "v-mod", styleFamily: "MODERN", businessType: "VAPE_SHOP", restaurantName: NAME, colorSeed: "#111", palette: null, tagline: "M", cuisine: "n/a", overall: 80 },
  { id: "v-best", styleFamily: "LUXURY", businessType: "VAPE_SHOP", restaurantName: NAME, colorSeed: "#222", palette: { primary: "#1D3557" }, tagline: "Bold & premium", cuisine: "n/a", overall: 92 },
  { id: "v-min", styleFamily: "MINIMAL", businessType: "VAPE_SHOP", restaurantName: NAME, colorSeed: "#333", palette: null, tagline: "Mi", cuisine: "n/a", overall: 75 },
];

function props(overrides: Record<string, unknown> = {}) {
  return {
    restaurantName: "Easy Tobacco Shop",
    siteId: "site-1",
    selectedVersionId: "v-best",
    candidates: CANDIDATES,
    switchingTheme: false,
    onSelectTheme: vi.fn(),
    onUse: vi.fn(),
    phase: "review" as const,
    actionError: null as string | null,
    onApprove: vi.fn(),
    onRetryApprove: vi.fn(),
    onRetryPublish: vi.fn(),
    ...overrides,
  };
}

// Principle 2 (locked): these words must NEVER reach customer-facing UI (theme vocabulary + "AI").
const BANNED = /\b(ai|theme|themes|template|templates|variation|variations|modern|luxury|local|style\s*family)\b/i;

describe("DesignReviewScreen (storefront concept experience)", () => {
  it("renders no banned theme/template vocabulary anywhere in the DOM", () => {
    const { container } = render(<DesignReviewScreen {...props()} />);
    expect(container.textContent ?? "").not.toMatch(BANNED);
  });

  it("makes the recommended storefront dominate: name, description, recommended marker, primary CTA", () => {
    render(<DesignReviewScreen {...props()} />);
    expect(screen.getByRole("heading", { name: REC_NAME })).toBeInTheDocument();
    expect(screen.getByText(/puts your best offerings front and center/i)).toBeInTheDocument();
    expect(screen.getByText(/Recommended for you/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use This Storefront" })).toBeInTheDocument();
  });

  it("shows the REAL preview of the recommended storefront (not a mockup)", () => {
    render(<DesignReviewScreen {...props()} />);
    expect(screen.getByText("site-1:v-best")).toBeInTheDocument();
  });

  it("uses ONLY real previews for every option (no schematic/placeholder)", () => {
    render(<DesignReviewScreen {...props()} />);
    const previews = screen.getAllByTestId("real-preview").map((p) => p.textContent);
    expect(previews).toEqual(expect.arrayContaining(["site-1:v-best", "site-1:v-mod", "site-1:v-min"]));
  });

  it("fires onApprove from the primary CTA", () => {
    const onApprove = vi.fn();
    render(<DesignReviewScreen {...props({ onApprove })} />);
    fireEvent.click(screen.getByRole("button", { name: "Use This Storefront" }));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it("lists the other storefronts below as alternatives with their own names", () => {
    render(<DesignReviewScreen {...props()} />);
    expect(screen.getByText(/Other storefronts we designed for you/i)).toBeInTheDocument();
    // v-min (lowest score) is the last-ranked storefront → "… Signature".
    expect(screen.getByRole("heading", { name: LAST_NAME })).toBeInTheDocument();
  });

  it("selecting an alternative fires onSelectTheme with that storefront's id", () => {
    const onSelectTheme = vi.fn();
    render(<DesignReviewScreen {...props({ onSelectTheme })} />);
    fireEvent.click(screen.getByRole("button", { name: `See ${LAST_NAME}` }));
    expect(onSelectTheme).toHaveBeenCalledWith("v-min");
  });

  it("shows NO premature success claim at the review gate (nothing is public yet)", () => {
    render(<DesignReviewScreen {...props()} />);
    expect(screen.queryByText(/open for business/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/you're live/i)).not.toBeInTheDocument();
    expect(screen.getByText(/nothing is public yet/i)).toBeInTheDocument();
  });

  it("approving: shows in-progress state and hides the primary CTA", () => {
    render(<DesignReviewScreen {...props({ phase: "approving" })} />);
    expect(screen.getByText(/Setting up your storefront/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use This Storefront" })).not.toBeInTheDocument();
  });

  it("publishing: shows publishing-in-progress (no 'live' claim yet)", () => {
    render(<DesignReviewScreen {...props({ phase: "publishing" })} />);
    expect(screen.getByText(/Publishing your storefront/)).toBeInTheDocument();
    expect(screen.queryByText(/open for business/i)).not.toBeInTheDocument();
  });

  it("approve_failed: surfaces the error and a retry", () => {
    const onRetryApprove = vi.fn();
    render(<DesignReviewScreen {...props({ phase: "approve_failed", actionError: "approval service down", onRetryApprove })} />);
    expect(screen.getByText("approval service down")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetryApprove).toHaveBeenCalledTimes(1);
  });

  it("publish_failed: surfaces the readiness error and a publish-only retry", () => {
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

  it("preview unavailable: shows a clear message and no primary CTA when nothing is selected", () => {
    render(<DesignReviewScreen {...props({ selectedVersionId: null })} />);
    expect(screen.getByText(/Preview unavailable right now/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use This Storefront" })).not.toBeInTheDocument();
  });

  it("disables alternative selection while a switch is applying", () => {
    render(<DesignReviewScreen {...props({ switchingTheme: true })} />);
    expect(screen.getByRole("button", { name: `See ${MID_NAME}` })).toBeDisabled();
    expect(screen.getByText(/Applying…/)).toBeInTheDocument();
  });
});

describe("DesignReviewScreen — Storefront Showcase mode (NEXT_PUBLIC_STOREFRONT_SHOWCASE=true)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("renders the vertical full-height showcase instead of cards", async () => {
    vi.stubEnv("NEXT_PUBLIC_STOREFRONT_SHOWCASE", "true");
    render(<DesignReviewScreen {...props()} />);
    expect(screen.getByTestId("storefront-showcase")).toBeInTheDocument();
    expect(screen.getAllByTestId("storefront-section")).toHaveLength(3);
    // Every option is a REAL preview (LazyMount's jsdom fallback mounts on the
    // next tick, hence async); recommended is marked once; per-section CTA.
    expect(await screen.findAllByTestId("real-preview")).toHaveLength(3);
    expect(screen.getAllByText("Recommended")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Use This Storefront" })).toHaveLength(3);
    // No "alternatives" framing, no descriptions.
    expect(screen.queryByText(/Other storefronts we designed for you/i)).not.toBeInTheDocument();
  });

  it("the recommended (highest-score) storefront's CTA fires onUse with its id", () => {
    vi.stubEnv("NEXT_PUBLIC_STOREFRONT_SHOWCASE", "true");
    const onUse = vi.fn();
    render(<DesignReviewScreen {...props({ onUse })} />);
    // v-best (92) is recommended → first section's CTA.
    fireEvent.click(screen.getAllByRole("button", { name: "Use This Storefront" })[0]);
    expect(onUse).toHaveBeenCalledWith("v-best");
  });
});
