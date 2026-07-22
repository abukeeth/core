import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Stub the real preview (needs a token + iframe); assert the showcase wires the
// REAL DevicePreview in immersive mode — never a card/thumbnail/mockup.
vi.mock("../website/variations/[id]/device-preview", () => ({
  DevicePreview: ({ siteId, variationId, chromeless }: { siteId: string; variationId: string; chromeless?: boolean }) => (
    <div data-testid="device-preview" data-chromeless={String(!!chromeless)}>
      {siteId}:{variationId}
    </div>
  ),
}));

import { StorefrontShowcase, StorefrontShowcaseSection } from "./storefront-showcase";

// Locked: none of these words may appear in customer-facing UI — theme
// vocabulary, "AI", and the retired concept-tier names.
const BANNED = /\b(ai|theme|themes|template|templates|variation|variations|modern|luxury|local|style\s*family|prestige|reserve|signature|briefs?|archetypes?|identity|identities)\b/i;

function renderShowcase(onUse = vi.fn()) {
  const items = [
    { id: "v1", name: "Bil Deli — storefront 1" },
    { id: "v2", name: "Bil Deli — storefront 2" },
    { id: "v3", name: "Bil Deli — storefront 3" },
  ];
  const result = render(
    <StorefrontShowcase>
      {items.map((it) => (
        <StorefrontShowcaseSection
          key={it.id}
          siteId="site-1"
          variationId={it.id}
          name={it.name}
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
  it("renders one full-height section per storefront, each a REAL full-bleed chromeless storefront (no cards/previews)", async () => {
    renderShowcase();
    const sections = screen.getAllByTestId("storefront-section");
    expect(sections).toHaveLength(3);
    // LazyMount's no-IntersectionObserver fallback (jsdom) mounts on the next
    // tick, so the real previews appear asynchronously.
    const previews = await screen.findAllByTestId("device-preview");
    expect(previews).toHaveLength(3);
    previews.forEach((p) => expect(p).toHaveAttribute("data-chromeless", "true"));
    expect(screen.getByText("site-1:v1")).toBeInTheDocument();
  });

  it("treats all storefronts identically — same full height, no badges or markers on any of them", () => {
    renderShowcase();
    const heights = screen.getAllByTestId("storefront-section").map((s) => s.className.includes("h-[100svh]"));
    expect(heights).toEqual([true, true, true]);
    expect(screen.queryByText(/Recommended/i)).not.toBeInTheDocument();
  });

  it("shows NO visible name, headline, description, or palette chips — the storefront is the only presentation", () => {
    renderShowcase();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Brand colors")).not.toBeInTheDocument();
    // The label is not painted as chrome — it only names the section for assistive tech.
    expect(screen.queryByText("Bil Deli — storefront 1")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("storefront-section")[0]).toHaveAttribute("aria-label", "Bil Deli — storefront 1");
  });

  it("keeps a 'Use This Storefront' CTA in every section and wires it to the handler", () => {
    const { onUse } = renderShowcase();
    const ctas = screen.getAllByRole("button", { name: "Use This Storefront" });
    expect(ctas).toHaveLength(3);
    fireEvent.click(ctas[2]);
    expect(onUse).toHaveBeenCalledWith("v3");
  });

  it("never renders banned theme/template/AI/concept-tier vocabulary", () => {
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

  it("labels each section for assistive tech and pairs it with a single action", () => {
    renderShowcase();
    const first = screen.getAllByTestId("storefront-section")[0];
    expect(first).toHaveAttribute("aria-label", "Bil Deli — storefront 1");
    expect(within(first).getByRole("button", { name: "Use This Storefront" })).toBeInTheDocument();
  });
});
