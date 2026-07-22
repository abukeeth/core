import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Stub the real preview (needs a token + iframe); assert the showcase wires the
// REAL DevicePreview in immersive mode — never a card/thumbnail/mockup.
vi.mock("../website/variations/[id]/device-preview", () => ({
  DevicePreview: ({ siteId, variationId, immersive }: { siteId: string; variationId: string; immersive?: boolean }) => (
    <div data-testid="device-preview" data-immersive={String(!!immersive)}>
      {siteId}:{variationId}
    </div>
  ),
}));

import { StorefrontShowcase, StorefrontShowcaseSection } from "./storefront-showcase";

// Locked: none of these words may appear in customer-facing UI.
const BANNED = /\b(ai|theme|themes|template|templates|variation|variations|modern|luxury|local|style\s*family)\b/i;

function renderShowcase(onUse = vi.fn()) {
  const items = [
    { id: "v1", name: "Bil Prestige", rec: true },
    { id: "v2", name: "Bil Reserve", rec: false },
    { id: "v3", name: "Bil Signature", rec: false },
  ];
  const result = render(
    <StorefrontShowcase>
      {items.map((it) => (
        <StorefrontShowcaseSection
          key={it.id}
          siteId="site-1"
          variationId={it.id}
          name={it.name}
          isRecommended={it.rec}
          action={
            <button type="button" onClick={() => onUse(it.id)}>
              Use This Storefront
            </button>
          }
        />
      ))}
    </StorefrontShowcase>,
  );
  return { ...result, onUse };
}

describe("Storefront Showcase", () => {
  it("renders one full-height section per storefront, each with a REAL immersive preview (no cards/thumbnails)", () => {
    renderShowcase();
    const sections = screen.getAllByTestId("storefront-section");
    expect(sections).toHaveLength(3);
    const previews = screen.getAllByTestId("device-preview");
    expect(previews).toHaveLength(3);
    previews.forEach((p) => expect(p).toHaveAttribute("data-immersive", "true"));
    expect(screen.getByText("site-1:v1")).toBeInTheDocument();
  });

  it("marks only the first (recommended) storefront, and does not diminish the others", () => {
    renderShowcase();
    expect(screen.getAllByText("Recommended")).toHaveLength(1);
    // All sections share the same height class — none is shrunk/dominant.
    const heights = screen.getAllByTestId("storefront-section").map((s) => s.className.includes("h-[100svh]"));
    expect(heights).toEqual([true, true, true]);
  });

  it("shows the storefront name only in the sticky action bar — no headline or description over the hero", () => {
    renderShowcase();
    // No headings sit above the previews.
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    // No design commentary / palette chips.
    expect(screen.queryByLabelText("Brand colors")).not.toBeInTheDocument();
    expect(screen.queryByText(/front and center|tells your brand|everyday visits/i)).not.toBeInTheDocument();
    expect(screen.getByText("Bil Prestige")).toBeInTheDocument();
  });

  it("keeps a 'Use This Storefront' CTA in every section and wires it to the handler", () => {
    const { onUse } = renderShowcase();
    const ctas = screen.getAllByRole("button", { name: "Use This Storefront" });
    expect(ctas).toHaveLength(3);
    fireEvent.click(ctas[2]);
    expect(onUse).toHaveBeenCalledWith("v3");
  });

  it("never renders banned theme/template/AI vocabulary", () => {
    const { container } = renderShowcase();
    expect(container.textContent ?? "").not.toMatch(BANNED);
  });

  it("uses vertical scroll-snap and disables snapping under reduced motion", () => {
    renderShowcase();
    const showcase = screen.getByTestId("storefront-showcase");
    expect(showcase.className).toContain("snap-y");
    expect(showcase.className).toContain("snap-mandatory");
    expect(showcase.className).toContain("motion-reduce:snap-none");
  });

  it("each section's action bar labels its own storefront (accessible pairing)", () => {
    renderShowcase();
    const first = screen.getAllByTestId("storefront-section")[0];
    expect(within(first).getByText("Bil Prestige")).toBeInTheDocument();
    expect(within(first).getByRole("button", { name: "Use This Storefront" })).toBeInTheDocument();
  });
});
