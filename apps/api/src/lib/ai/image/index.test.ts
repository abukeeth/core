import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ImageGenerationError, generateImage, getImageProvider, isImageGenerationEnabled } from "./index";
import type { ImageProvider } from "./types";

const ENV = ["AI_IMAGE_ENABLED", "AI_IMAGE_BACKEND", "AI_IMAGE_ROUTES", "AI_IMAGE_TIMEOUT_MS"];
function clearEnv() {
  for (const key of ENV) delete process.env[key];
}
beforeEach(clearEnv);
afterEach(clearEnv);

function fakeProvider(over: Partial<ImageProvider> = {}): ImageProvider {
  return {
    name: "fake",
    generate: async () => ({ data: Buffer.from("img"), mediaType: "image/png" }),
    ...over,
  };
}

describe("isImageGenerationEnabled", () => {
  it("is off by default (never fires by accident)", () => {
    expect(isImageGenerationEnabled()).toBe(false);
  });
  it("is on when AI_IMAGE_ENABLED=true", () => {
    process.env.AI_IMAGE_ENABLED = "true";
    expect(isImageGenerationEnabled()).toBe(true);
  });
});

describe("getImageProvider — config-driven vertical routing", () => {
  it("defaults to the stability backend", () => {
    expect(getImageProvider().name).toBe("stability");
    expect(getImageProvider("DELI").name).toBe("stability");
  });

  it("honors AI_IMAGE_BACKEND as the default backend", () => {
    process.env.AI_IMAGE_BACKEND = "stability";
    expect(getImageProvider("COFFEE_SHOP").name).toBe("stability");
  });

  it("routes a specific vertical via AI_IMAGE_ROUTES over the default", () => {
    process.env.AI_IMAGE_BACKEND = "stability";
    process.env.AI_IMAGE_ROUTES = "VAPE_SHOP=stability, COFFEE_SHOP=stability";
    expect(getImageProvider("VAPE_SHOP").name).toBe("stability");
    // A vertical with no route falls through to the default backend.
    expect(getImageProvider("RETAIL").name).toBe("stability");
  });

  it("throws not_configured for an unknown backend name", () => {
    process.env.AI_IMAGE_BACKEND = "does-not-exist";
    expect(() => getImageProvider()).toThrow(ImageGenerationError);
    try {
      getImageProvider();
    } catch (err) {
      expect((err as ImageGenerationError).reason).toBe("not_configured");
    }
  });
});

describe("generateImage — flag, timeout, and error normalization", () => {
  it("throws not_configured when the feature flag is off", async () => {
    await expect(generateImage({ prompt: "x" }, { provider: fakeProvider() })).rejects.toMatchObject({ reason: "not_configured" });
  });

  it("returns the image when enabled", async () => {
    process.env.AI_IMAGE_ENABLED = "true";
    const image = await generateImage({ prompt: "x" }, { provider: fakeProvider() });
    expect(image.mediaType).toBe("image/png");
    expect(image.data.toString()).toBe("img");
  });

  it("normalizes an unexpected provider error to provider_error", async () => {
    process.env.AI_IMAGE_ENABLED = "true";
    const provider = fakeProvider({
      generate: async () => {
        throw new Error("boom");
      },
    });
    await expect(generateImage({ prompt: "x" }, { provider })).rejects.toMatchObject({ reason: "provider_error" });
  });

  it("passes a typed ImageGenerationError through unchanged (e.g. content_rejected)", async () => {
    process.env.AI_IMAGE_ENABLED = "true";
    const provider = fakeProvider({
      generate: async () => {
        throw new ImageGenerationError("content_rejected", "nope", false);
      },
    });
    await expect(generateImage({ prompt: "x" }, { provider })).rejects.toMatchObject({ reason: "content_rejected" });
  });

  it("times out a slow provider with reason=timeout", async () => {
    process.env.AI_IMAGE_ENABLED = "true";
    const provider = fakeProvider({ generate: () => new Promise(() => {}) }); // never resolves
    await expect(generateImage({ prompt: "x" }, { provider, timeoutMs: 20 })).rejects.toMatchObject({ reason: "timeout" });
  });
});
