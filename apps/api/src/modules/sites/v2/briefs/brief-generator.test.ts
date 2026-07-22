import { describe, expect, it } from "vitest";
import type { IngestData } from "../../types";
import { buildBusinessUnderstanding } from "../understanding/build-understanding";
import { generateCreativeBriefs, proceduralBriefs } from "./brief-generator";
import { validateDiversity } from "./diversity-validator";
import { GOOGLE_FONTS } from "../../renderer/web-fonts";

function ingestFor(name: string, type: string, menu: [string, string, number, string][]): IngestData {
  return {
    restaurantId: `r-${name}`,
    restaurantName: name,
    description: "",
    photoCount: 0,
    businessType: type,
    menu: menu.map(([n, d, p, c]) => ({ name: n, description: d, priceCents: p, categoryName: c })),
  } as unknown as IngestData;
}

const FIXTURES = [
  ingestFor("DELI Fresh & Local", "DELI", [
    ["Pastrami on Rye", "Hand-carved, cured in-house", 1149, "Signature Sandwiches"],
    ["Deli Club", "Triple stacked daily", 1049, "Deli Classics"],
    ["Garden Wrap", "", 899, "Specialty Wraps"],
  ]),
  ingestFor("Qahwah Palace", "COFFEE_SHOP", [
    ["Spanish Latte", "House condensed-milk blend", 425, "Espresso Drinks"],
    ["Saffron Cold Brew", "18-hour steep", 475, "Cold Bar"],
    ["Date Cake", "Warm, espresso caramel", 495, "Desserts"],
  ]),
  ingestFor("Cloud Nine Vapor", "VAPE_SHOP", [
    ["Mango Ice 5000", "", 1899, "Disposables"],
    ["Blue Razz Pod Pack", "", 1599, "Pod Systems"],
    ["Coil 5-Pack", "", 1299, "Coils & Accessories"],
  ]),
  ingestFor("Golden Crust Bakery", "BAKERY", [
    ["Country Sourdough", "48-hour ferment, stone-baked", 850, "Breads"],
    ["Almond Croissant", "Laminated 27 layers", 425, "Pastries"],
    ["Chocolate Fudge Cake", "Whole, serves 12", 3200, "Cakes"],
  ]),
];

describe("proceduralBriefs — the archetype-free floor", () => {
  it("every generated trio passes the diversity gate, for every fixture business", () => {
    for (const ingest of FIXTURES) {
      const u = buildBusinessUnderstanding({ ingest });
      const briefs = proceduralBriefs(u, "seed-A");
      expect(validateDiversity(briefs).pass, u.identity.name).toBe(true);
    }
  });

  it("the SAME business with a DIFFERENT seed produces a materially different trio (no fixed A/B/C)", () => {
    const u = buildBusinessUnderstanding({ ingest: FIXTURES[0] });
    const a = proceduralBriefs(u, "seed-A");
    const b = proceduralBriefs(u, "seed-B");
    const signature = (briefs: ReturnType<typeof proceduralBriefs>) =>
      briefs.map((x) => `${x.typography.display}|${x.heroConcept.composition}|${x.colorLogic.ground.hex}`).join("::");
    expect(signature(a)).not.toBe(signature(b));
  });

  it("DIFFERENT businesses produce different trios (cross-business variance — impossible under archetypes)", () => {
    const signatures = FIXTURES.map((ingest) => {
      const briefs = proceduralBriefs(buildBusinessUnderstanding({ ingest }), "seed-A");
      return briefs.map((x) => `${x.typography.display}|${x.heroConcept.composition}|${x.colorLogic.ground.hex}|${x.centralIdea}`).join("::");
    });
    expect(new Set(signatures).size).toBe(FIXTURES.length);
  });

  it("briefs are grounded in the business's REAL products/evidence, not generic filler", () => {
    const u = buildBusinessUnderstanding({ ingest: FIXTURES[0] });
    const briefs = proceduralBriefs(u, "seed-A");
    const allText = JSON.stringify(briefs);
    expect(allText).toContain("Pastrami on Rye"); // flagship reaches copy/photo subjects
  });

  it("an evidence-gated angle only appears when the evidence exists (occasions needs a price outlier)", () => {
    const plain = buildBusinessUnderstanding({ ingest: FIXTURES[0] });
    for (const seed of ["s1", "s2", "s3", "s4", "s5"]) {
      const briefs = proceduralBriefs(plain, seed);
      expect(briefs.some((b) => b.id.includes("occasions"))).toBe(false);
    }
    const bakery = buildBusinessUnderstanding({ ingest: FIXTURES[3] }); // $32 cake outlier
    const seen = ["s1", "s2", "s3", "s4", "s5"].some((seed) => proceduralBriefs(bakery, seed).some((b) => b.id.includes("occasions")));
    expect(seen).toBe(true);
  });

  it("every chosen typeface is actually loadable and deterministic per (business, seed)", () => {
    const u = buildBusinessUnderstanding({ ingest: FIXTURES[1] });
    const briefs = proceduralBriefs(u, "seed-X");
    for (const b of briefs) {
      expect(GOOGLE_FONTS).toHaveProperty(b.typography.display);
      expect(GOOGLE_FONTS).toHaveProperty(b.typography.body);
    }
    expect(proceduralBriefs(u, "seed-X")).toEqual(briefs);
  });
});

describe("generateCreativeBriefs — AI path with procedural floor", () => {
  it("uses valid AI briefs when the completion returns diverse JSON", async () => {
    const u = buildBusinessUnderstanding({ ingest: FIXTURES[0] });
    const fromProc = proceduralBriefs(u, "ai-fixture"); // structurally valid + diverse
    const complete = async () => JSON.stringify({ briefs: fromProc });
    const result = await generateCreativeBriefs(u, { complete, seed: "s" });
    expect(result.origin).toBe("ai");
    expect(result.briefs).toHaveLength(3);
    expect(result.briefs[0].origin).toBe("ai");
  });

  it("falls back to the procedural floor on invalid AI output and still passes diversity", async () => {
    const u = buildBusinessUnderstanding({ ingest: FIXTURES[2] });
    const complete = async () => "sorry, I cannot help with that";
    const result = await generateCreativeBriefs(u, { complete, seed: "s" });
    expect(result.origin).toBe("procedural");
    expect(validateDiversity(result.briefs).pass).toBe(true);
  });

  it("falls back when the completion throws (provider down) — generation never dies", async () => {
    const u = buildBusinessUnderstanding({ ingest: FIXTURES[1] });
    const complete = async () => {
      throw new Error("provider down");
    };
    const result = await generateCreativeBriefs(u, { complete, seed: "s" });
    expect(result.origin).toBe("procedural");
    expect(result.briefs).toHaveLength(3);
  });
});
