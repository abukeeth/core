import { describe, expect, it } from "vitest";
import type { IngestData } from "../../types";
import { buildBusinessUnderstanding } from "./build-understanding";

function deliIngest(): IngestData {
  return {
    restaurantId: "r1",
    restaurantName: "DELI Fresh & Local",
    description: "",
    photoCount: 0,
    businessType: "RESTAURANT",
    menu: [
      { name: "Pastrami on Rye", description: "Hand-carved, cured in-house", priceCents: 1149, categoryName: "Signature Sandwiches" },
      { name: "Deli Club", description: "Triple stacked daily", priceCents: 1049, categoryName: "Deli Classics" },
      { name: "Garden Wrap", description: "Fresh", priceCents: 899, categoryName: "Specialty Wraps" },
      { name: "Iced Tea", description: "", priceCents: 299, categoryName: "Beverages" },
    ],
  } as unknown as IngestData;
}

describe("buildBusinessUnderstanding", () => {
  it("overrides a mis-stored RESTAURANT to DELI and records the evidence for it", () => {
    const u = buildBusinessUnderstanding({ ingest: deliIngest() });
    expect(u.identity.resolvedVertical).toBe("DELI");
    expect(u.evidence.some((e) => /overridden to DELI/.test(e.claim))).toBe(true);
  });

  it("computes the price tier from real prices with a PRICES evidence entry", () => {
    const u = buildBusinessUnderstanding({ ingest: deliIngest() });
    expect(["casual", "premium-casual"]).toContain(u.identity.priceTier);
    expect(u.evidence.some((e) => e.source === "PRICES")).toBe(true);
  });

  it("detects process-proud craft language from item descriptions", () => {
    const u = buildBusinessUnderstanding({ ingest: deliIngest() });
    expect(u.evidence.some((e) => /process-proud/i.test(e.claim) && e.source === "DESCRIPTION")).toBe(true);
  });

  it("flags a mixed tier / occasions line when one item towers over the median", () => {
    const ingest = deliIngest();
    ingest.menu.push({ name: "Party Platter", description: "", priceCents: 6500, categoryName: "Catering" } as IngestData["menu"][number]);
    const u = buildBusinessUnderstanding({ ingest });
    expect(u.evidence.some((e) => /Party Platter.*×.*occasions|occasions.*Party Platter/i.test(e.claim) || /"Party Platter"/.test(e.claim))).toBe(
      true,
    );
  });

  it("is deterministic: same input → identical understanding", () => {
    expect(buildBusinessUnderstanding({ ingest: deliIngest() })).toEqual(buildBusinessUnderstanding({ ingest: deliIngest() }));
  });

  it("real flagship product names only, capped at 8", () => {
    const u = buildBusinessUnderstanding({ ingest: deliIngest() });
    expect(u.catalog.flagshipProducts).toContain("Pastrami on Rye");
    expect(u.catalog.flagshipProducts.length).toBeLessThanOrEqual(8);
  });
});
