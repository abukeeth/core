import { describe, expect, it } from "vitest";
import { ambientPlaceholder, dishPlaceholder, featurePlaceholder, heroPlaceholder } from "./placeholder-imagery";

const generators: [string, (s: string) => string][] = [
  ["hero", heroPlaceholder],
  ["dish", dishPlaceholder],
  ["feature", featurePlaceholder],
  ["ambient", ambientPlaceholder],
];

function decode(uri: string): string {
  const b64 = uri.replace("data:image/svg+xml;base64,", "");
  return Buffer.from(b64, "base64").toString("utf-8");
}

describe("placeholder-imagery — self-contained art-directed placeholders", () => {
  for (const [name, gen] of generators) {
    describe(name, () => {
      it("returns a self-contained SVG data URI — never an external hotlink", () => {
        const out = gen("Duck confit");
        expect(out.startsWith("data:image/svg+xml;base64,")).toBe(true);
        const svg = decode(out);
        expect(svg).toContain("<svg");
        // No external resource references — ignore the standard SVG xmlns
        // namespace URL (declarative, never fetched).
        const withoutNs = svg.replace(/xmlns(:\w+)?="[^"]*"/g, "");
        expect(withoutNs).not.toMatch(/https?:\/\//);
        expect(withoutNs).not.toMatch(/href=/);
      });

      it("is deterministic on its seed", () => {
        expect(gen("Côte de bœuf")).toBe(gen("Côte de bœuf"));
      });

      it("varies across seeds", () => {
        expect(gen("Duck confit")).not.toBe(gen("Line-caught turbot"));
      });

      it("never emits negative SVG coordinates (guards the signed-shift bug across many seeds)", () => {
        // A wide spread of seeds — the hash's high bit set is what produced
        // invalid negative rx/ry/cx/cy under a signed >> shift.
        for (const seed of ["a", "zzzz", "Tarte tatin", "Crème brûlée", "Poulet rôti", "The Room", "xyzzy-42", "Maison Laurent-ambience"]) {
          const svg = decode(gen(seed));
          expect(svg).not.toMatch(/(?:cx|cy|rx|ry|r|width|height)="-/);
        }
      });
    });
  }
});
