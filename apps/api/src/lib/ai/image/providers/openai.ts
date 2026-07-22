import OpenAI from "openai";
import { getNumberEnv, getOptionalEnv, getStringEnv } from "../../../../config/env";
import { ImageGenerationError, type GeneratedImage, type ImageAspect, type ImageGenerationRequest, type ImageProvider } from "../types";

/**
 * OpenAI image backend (gpt-image-1 by default, dall-e-3 supported).
 *
 * All OpenAI-specific knowledge (model, size mapping, response shape, error
 * semantics) is isolated here; the rest of the platform sees only the
 * provider-agnostic `ImageProvider` contract. The images.generate call is
 * injectable so the behavior is fully unit-testable without a network or a key.
 *
 * gpt-image-1 has no `negative_prompt` field, so avoid-terms are folded into the
 * prompt. It returns base64 (`b64_json`) directly; dall-e-3 is asked for the
 * same via `response_format` so both paths yield bytes we store ourselves
 * (never a hotlink).
 */

const DEFAULT_MODEL = "gpt-image-1";
const DEFAULT_TIMEOUT_MS = 120_000;

type SizeMap = Record<ImageAspect, string>;
const GPT_IMAGE_SIZES: SizeMap = { square: "1024x1024", landscape: "1536x1024", portrait: "1024x1536" };
const DALLE3_SIZES: SizeMap = { square: "1024x1024", landscape: "1792x1024", portrait: "1024x1792" };

function sizeFor(model: string, aspect: ImageAspect): string {
  const sizes = model.includes("dall-e-3") ? DALLE3_SIZES : GPT_IMAGE_SIZES;
  return sizes[aspect];
}

/** Minimal response shape we depend on — kept local so the SDK stays swappable. */
export interface OpenAIImageResult {
  data?: Array<{ b64_json?: string | null; url?: string | null }> | null;
}

export interface OpenAIImageParams {
  model: string;
  prompt: string;
  size: string;
  n: number;
  response_format?: "b64_json";
}

export type OpenAIImageGenerate = (params: OpenAIImageParams) => Promise<OpenAIImageResult>;

function defaultGenerate(apiKey: string): OpenAIImageGenerate {
  const client = new OpenAI({ apiKey, timeout: getNumberEnv("AI_IMAGE_TIMEOUT_MS", DEFAULT_TIMEOUT_MS), maxRetries: 0 });
  // The SDK's typed params are wider than ours; the fields we send are valid for
  // gpt-image-1 / dall-e-3.
  return (params) => client.images.generate(params as OpenAI.Images.ImageGenerateParams) as Promise<OpenAIImageResult>;
}

function mapError(err: unknown): ImageGenerationError {
  if (err instanceof ImageGenerationError) return err;
  const status = typeof (err as { status?: unknown })?.status === "number" ? (err as { status: number }).status : undefined;
  const code = typeof (err as { code?: unknown })?.code === "string" ? (err as { code: string }).code : "";
  const message = err instanceof Error ? err.message : String(err);
  if (code === "content_policy_violation" || /content[_ ]policy|safety system|moderation/i.test(message)) {
    return new ImageGenerationError("content_rejected", `OpenAI rejected the prompt: ${message}`, false, { cause: err });
  }
  if (status === 429) return new ImageGenerationError("rate_limited", "OpenAI rate limit exceeded", true, { cause: err });
  if (status === 401 || status === 403) return new ImageGenerationError("provider_error", `OpenAI auth failed (${status})`, false, { cause: err });
  if (typeof status === "number" && status >= 500) return new ImageGenerationError("provider_error", `OpenAI responded ${status}`, true, { cause: err });
  return new ImageGenerationError("provider_error", `OpenAI image generation failed: ${message}`, false, { cause: err });
}

export class OpenAIImageProvider implements ImageProvider {
  readonly name = "openai";

  constructor(
    private readonly generateImpl?: OpenAIImageGenerate,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async generate(request: ImageGenerationRequest): Promise<GeneratedImage> {
    const apiKey = getOptionalEnv("OPENAI_API_KEY");
    if (!apiKey) {
      throw new ImageGenerationError("not_configured", "OPENAI_API_KEY is not set", false);
    }
    const model = getStringEnv("OPENAI_IMAGE_MODEL", DEFAULT_MODEL);
    const size = sizeFor(model, request.aspect ?? "landscape");
    // gpt-image-1 has no negative-prompt field — fold avoid-terms into the prompt.
    const prompt = request.negativePrompt ? `${request.prompt}. Avoid: ${request.negativePrompt}.` : request.prompt;

    const params: OpenAIImageParams = { model, prompt, size, n: 1 };
    // dall-e models default to returning a URL; ask for bytes. gpt-image-1
    // always returns b64_json and rejects this field, so only send it for dall-e.
    if (model.includes("dall-e")) params.response_format = "b64_json";

    const generate = this.generateImpl ?? defaultGenerate(apiKey);

    let result: OpenAIImageResult;
    try {
      result = await generate(params);
    } catch (err) {
      throw mapError(err);
    }

    const first = result.data?.[0];
    let data: Buffer | null = null;
    if (first?.b64_json) {
      data = Buffer.from(first.b64_json, "base64");
    } else if (first?.url) {
      try {
        const res = await this.fetchImpl(first.url);
        data = Buffer.from(await res.arrayBuffer());
      } catch (err) {
        throw new ImageGenerationError("provider_error", `Failed to download OpenAI image: ${err instanceof Error ? err.message : String(err)}`, true, { cause: err });
      }
    }

    if (!data || data.length === 0) {
      throw new ImageGenerationError("provider_error", "OpenAI returned no image data", true);
    }
    return { data, mediaType: "image/png" };
  }
}
