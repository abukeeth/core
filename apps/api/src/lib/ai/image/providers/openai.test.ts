import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ImageGenerationError } from "../types";
import { OpenAIImageProvider, type OpenAIImageParams, type OpenAIImageResult } from "./openai";

beforeEach(() => {
  process.env.OPENAI_API_KEY = "sk-openai-test";
});
afterEach(() => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_IMAGE_MODEL;
});

describe("OpenAIImageProvider", () => {
  it("throws not_configured when OPENAI_API_KEY is missing", async () => {
    delete process.env.OPENAI_API_KEY;
    const provider = new OpenAIImageProvider(async () => ({ data: [{ b64_json: "" }] }));
    await expect(provider.generate({ prompt: "x" })).rejects.toMatchObject({ reason: "not_configured" });
  });

  it("decodes b64_json into PNG bytes and maps aspect → gpt-image-1 size, folding the negative into the prompt", async () => {
    let captured: OpenAIImageParams | undefined;
    const generate = async (params: OpenAIImageParams): Promise<OpenAIImageResult> => {
      captured = params;
      return { data: [{ b64_json: Buffer.from("PNGDATA").toString("base64") }] };
    };
    const provider = new OpenAIImageProvider(generate);

    const image = await provider.generate({ prompt: "a latte", aspect: "landscape", negativePrompt: "text, logo" });

    expect(image.mediaType).toBe("image/png");
    expect(image.data.toString()).toBe("PNGDATA");
    expect(captured?.model).toBe("gpt-image-1");
    expect(captured?.size).toBe("1536x1024");
    expect(captured?.prompt).toBe("a latte. Avoid: text, logo.");
    // gpt-image-1 rejects response_format, so it must not be sent.
    expect(captured?.response_format).toBeUndefined();
  });

  it("asks dall-e-3 for b64_json and uses its wider landscape size", async () => {
    process.env.OPENAI_IMAGE_MODEL = "dall-e-3";
    let captured: OpenAIImageParams | undefined;
    const provider = new OpenAIImageProvider(async (params) => {
      captured = params;
      return { data: [{ b64_json: Buffer.from("X").toString("base64") }] };
    });
    await provider.generate({ prompt: "a shop", aspect: "landscape" });
    expect(captured?.model).toBe("dall-e-3");
    expect(captured?.size).toBe("1792x1024");
    expect(captured?.response_format).toBe("b64_json");
  });

  it("downloads the image when the provider returns a url instead of bytes", async () => {
    const fetchImpl: typeof fetch = async () => new Response(Buffer.from("REMOTE"));
    const provider = new OpenAIImageProvider(async () => ({ data: [{ url: "https://cdn/x.png" }] }), fetchImpl);
    const image = await provider.generate({ prompt: "x" });
    expect(image.data.toString()).toBe("REMOTE");
  });

  it("maps a content-policy rejection to content_rejected (non-retryable)", async () => {
    const provider = new OpenAIImageProvider(async () => {
      throw Object.assign(new Error("Your request was rejected by the safety system"), { status: 400, code: "content_policy_violation" });
    });
    await expect(provider.generate({ prompt: "x" })).rejects.toMatchObject({ reason: "content_rejected", retryable: false });
  });

  it("maps HTTP 429 to a retryable rate_limited error", async () => {
    const provider = new OpenAIImageProvider(async () => {
      throw Object.assign(new Error("slow down"), { status: 429 });
    });
    await expect(provider.generate({ prompt: "x" })).rejects.toMatchObject({ reason: "rate_limited", retryable: true });
  });

  it("maps a 401 to a non-retryable provider_error (bad key)", async () => {
    const provider = new OpenAIImageProvider(async () => {
      throw Object.assign(new Error("invalid api key"), { status: 401 });
    });
    await expect(provider.generate({ prompt: "x" })).rejects.toMatchObject({ reason: "provider_error", retryable: false });
  });

  it("maps a 5xx to a retryable provider_error", async () => {
    const provider = new OpenAIImageProvider(async () => {
      throw Object.assign(new Error("server error"), { status: 503 });
    });
    await expect(provider.generate({ prompt: "x" })).rejects.toMatchObject({ reason: "provider_error", retryable: true });
  });

  it("errors when the response carries no image data", async () => {
    const provider = new OpenAIImageProvider(async () => ({ data: [] }));
    const error = await provider.generate({ prompt: "x" }).catch((e) => e);
    expect(error).toBeInstanceOf(ImageGenerationError);
    expect(error.reason).toBe("provider_error");
  });
});
