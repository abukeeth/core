import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ImageGenerationError } from "../types";
import { StabilityImageProvider } from "./stability";

beforeEach(() => {
  process.env.STABILITY_API_KEY = "sk-stability-test";
});
afterEach(() => {
  delete process.env.STABILITY_API_KEY;
  delete process.env.STABILITY_ENDPOINT;
});

function makeResponse(body: Buffer | string | null, init: ResponseInit = {}): Response {
  return new Response(body, init);
}

describe("StabilityImageProvider", () => {
  it("throws not_configured when STABILITY_API_KEY is missing", async () => {
    delete process.env.STABILITY_API_KEY;
    const provider = new StabilityImageProvider(async () => makeResponse(null));
    await expect(provider.generate({ prompt: "x" })).rejects.toMatchObject({ reason: "not_configured" });
  });

  it("returns PNG bytes on success and sends prompt / aspect / seed / negative", async () => {
    let capturedBody: FormData | undefined;
    let capturedAuth: string | undefined;
    const fetchImpl: typeof fetch = async (_input, init) => {
      capturedBody = init?.body as FormData;
      capturedAuth = (init?.headers as Record<string, string>)?.Authorization;
      return makeResponse(Buffer.from("PNGDATA"), { status: 200, headers: { "finish-reason": "SUCCESS" } });
    };
    const provider = new StabilityImageProvider(fetchImpl);

    const image = await provider.generate({ prompt: "a dark studio vape", aspect: "landscape", seed: 7, negativePrompt: "text, logo" });

    expect(image.mediaType).toBe("image/png");
    expect(image.data.toString()).toBe("PNGDATA");
    expect(capturedBody?.get("prompt")).toBe("a dark studio vape");
    expect(capturedBody?.get("aspect_ratio")).toBe("16:9");
    expect(capturedBody?.get("seed")).toBe("7");
    expect(capturedBody?.get("negative_prompt")).toBe("text, logo");
    expect(capturedAuth).toContain("Bearer ");
  });

  it("maps a CONTENT_FILTERED finish-reason to content_rejected", async () => {
    const provider = new StabilityImageProvider(async () =>
      makeResponse(Buffer.from(""), { status: 200, headers: { "finish-reason": "CONTENT_FILTERED" } }),
    );
    await expect(provider.generate({ prompt: "x" })).rejects.toMatchObject({ reason: "content_rejected", retryable: false });
  });

  it("maps HTTP 429 to a retryable rate_limited error", async () => {
    const provider = new StabilityImageProvider(async () => makeResponse("rate", { status: 429 }));
    await expect(provider.generate({ prompt: "x" })).rejects.toMatchObject({ reason: "rate_limited", retryable: true });
  });

  it("maps HTTP 403 to content_rejected", async () => {
    const provider = new StabilityImageProvider(async () => makeResponse("no", { status: 403 }));
    await expect(provider.generate({ prompt: "x" })).rejects.toMatchObject({ reason: "content_rejected" });
  });

  it("maps a 5xx to a retryable provider_error", async () => {
    const provider = new StabilityImageProvider(async () => makeResponse("err", { status: 503 }));
    await expect(provider.generate({ prompt: "x" })).rejects.toMatchObject({ reason: "provider_error", retryable: true });
  });

  it("wraps a network failure as a retryable provider_error", async () => {
    const provider = new StabilityImageProvider(async () => {
      throw new Error("ECONNRESET");
    });
    const error = await provider.generate({ prompt: "x" }).catch((e) => e);
    expect(error).toBeInstanceOf(ImageGenerationError);
    expect(error.reason).toBe("provider_error");
    expect(error.retryable).toBe(true);
  });
});
