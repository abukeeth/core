import { getOptionalEnv, getStringEnv } from "../../../../config/env";
import type { AIMediaType } from "../../types";
import { ImageGenerationError, type GeneratedImage, type ImageAspect, type ImageGenerationRequest, type ImageProvider } from "../types";

/**
 * Stability (SD3 / SDXL) image backend — the recommended default.
 *
 * All Stability-specific knowledge (endpoint, form fields, status/finish-reason
 * semantics) is isolated here; the rest of the platform sees only the
 * provider-agnostic `ImageProvider` contract. `fetch` is injected so the HTTP
 * behavior is fully unit-testable without a network or a key.
 */

const DEFAULT_ENDPOINT = "https://api.stability.ai/v2beta/stable-image/generate/core";

const ASPECT_RATIO: Record<ImageAspect, string> = {
  square: "1:1",
  landscape: "16:9",
  portrait: "9:16",
};

export class StabilityImageProvider implements ImageProvider {
  readonly name = "stability";

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async generate(request: ImageGenerationRequest): Promise<GeneratedImage> {
    const apiKey = getOptionalEnv("STABILITY_API_KEY");
    if (!apiKey) {
      throw new ImageGenerationError("not_configured", "STABILITY_API_KEY is not set", false);
    }
    const endpoint = getStringEnv("STABILITY_ENDPOINT", DEFAULT_ENDPOINT);

    const form = new FormData();
    form.set("prompt", request.prompt);
    form.set("output_format", "png");
    form.set("aspect_ratio", ASPECT_RATIO[request.aspect ?? "landscape"]);
    if (request.negativePrompt) form.set("negative_prompt", request.negativePrompt);
    if (typeof request.seed === "number") form.set("seed", String(request.seed));

    let response: Response;
    try {
      response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "image/*" },
        body: form,
      });
    } catch (err) {
      throw new ImageGenerationError("provider_error", `Stability request failed: ${err instanceof Error ? err.message : String(err)}`, true, { cause: err });
    }

    // Stability can return 200 with a content-moderation finish reason.
    if (response.headers.get("finish-reason") === "CONTENT_FILTERED") {
      throw new ImageGenerationError("content_rejected", "Stability filtered the prompt (content policy)", false);
    }

    if (!response.ok) {
      if (response.status === 429) throw new ImageGenerationError("rate_limited", "Stability rate limit exceeded", true);
      if (response.status === 403) throw new ImageGenerationError("content_rejected", "Stability rejected the request (403)", false);
      throw new ImageGenerationError("provider_error", `Stability responded ${response.status}`, response.status >= 500);
    }

    const data = Buffer.from(await response.arrayBuffer());
    if (data.length === 0) {
      throw new ImageGenerationError("provider_error", "Stability returned an empty image", true);
    }
    return { data, mediaType: "image/png" as AIMediaType };
  }
}
