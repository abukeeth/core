import { describe, expect, it } from "vitest";
import { renderReviews } from "./reviews";
import type { RenderContext, RenderReview } from "../render-context";
import type { SectionBlock, SiteDefinition } from "../../types";

function ctx(reviews?: RenderReview[]): RenderContext {
  return {
    siteId: "site-1",
    restaurantId: "restaurant-1",
    orderingBaseUrl: "http://localhost:3000",
    bestSellers: [],
    activeOffers: [],
    loyaltyProgram: null,
    definition: { restaurantName: "Maison" } as SiteDefinition,
    liveMenu: [],
    assets: { galleryImages: [] },
    reviews,
  };
}

const section: SectionBlock = { type: "reviews", props: {} };

describe("renderReviews", () => {
  it("omits the section entirely when there are no real reviews and no owner-authored fallback", () => {
    expect(renderReviews(section, ctx(undefined))).toBe("");
    expect(renderReviews(section, ctx([]))).toBe("");
  });

  it("renders real verified reviews resolved into the context", () => {
    const html = renderReviews(section, ctx([{ author: "Amara", rating: 5, quote: "Best meal all year." }]));
    expect(html).toContain('<section class="reviews">');
    expect(html).toContain("Best meal all year.");
    expect(html).toContain("Amara");
    expect(html).toContain("★★★★★");
  });

  it("prefers real reviews over any owner-typed props.reviews", () => {
    const withProps: SectionBlock = { type: "reviews", props: { reviews: [{ author: "Owner Quote", quote: "hand-typed" }] } };
    const html = renderReviews(withProps, ctx([{ author: "RealCustomer", rating: 4, quote: "genuinely great" }]));
    expect(html).toContain("RealCustomer");
    expect(html).toContain("genuinely great");
    expect(html).not.toContain("hand-typed");
  });

  it("still honors owner-authored props.reviews when the context carries no real reviews", () => {
    const withProps: SectionBlock = { type: "reviews", props: { reviews: [{ author: "Owner", quote: "our promise" }] } };
    const html = renderReviews(withProps, ctx(undefined));
    expect(html).toContain("our promise");
  });

  it("escapes review content", () => {
    const html = renderReviews(section, ctx([{ author: "<script>x</script>", rating: 5, quote: "<b>hi</b>" }]));
    expect(html).not.toContain("<script>x</script>");
    expect(html).not.toContain("<b>hi</b>");
  });
});
