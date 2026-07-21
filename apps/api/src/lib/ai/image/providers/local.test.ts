import { describe, expect, it } from "vitest";
import { LocalImageProvider } from "./local";

const provider = new LocalImageProvider();

describe("LocalImageProvider", () => {
  it("returns a self-contained SVG built from the prompt palette", async () => {
    const image = await provider.generate({ prompt: "hero. on-brand palette (background #0B0713, primary #7C3AED, accent #22D3EE)", aspect: "landscape" });
    expect(image.mediaType).toBe("image/svg+xml");
    const svg = image.data.toString("utf8");
    expect(svg).toContain("<svg");
    expect(svg).toContain("#0B0713"); // background
    expect(svg).toContain("#7C3AED"); // primary
    expect(svg).toContain("#22D3EE"); // accent
  });

  it("frames each aspect to the right dimensions", async () => {
    const landscape = (await provider.generate({ prompt: "#111111 #222222 #333333", aspect: "landscape" })).data.toString();
    const portrait = (await provider.generate({ prompt: "#111111 #222222 #333333", aspect: "portrait" })).data.toString();
    expect(landscape).toContain('viewBox="0 0 1600 900"');
    expect(portrait).toContain('viewBox="0 0 900 1600"');
  });

  it("is deterministic for the same request", async () => {
    const a = (await provider.generate({ prompt: "#0B0713 #7C3AED #22D3EE", seed: 5 })).data.toString();
    const b = (await provider.generate({ prompt: "#0B0713 #7C3AED #22D3EE", seed: 5 })).data.toString();
    expect(a).toBe(b);
  });
});
