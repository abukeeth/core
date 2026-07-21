import type { AIMediaType } from "../types";

/**
 * Sprint 5.5 — provider-agnostic AI image generation.
 *
 * This is the ONLY contract the branding layer, prompt builders, and the
 * generation pipeline depend on. No vendor type or SDK is referenced here, so a
 * provider can be swapped or added purely inside `lib/ai/image/` (a new class +
 * one registry line) with zero changes to application code.
 */

/** Provider-neutral aspect ratios; each provider maps these to its own dimensions. */
export type ImageAspect = "square" | "landscape" | "portrait";

export interface ImageGenerationRequest {
  /** The full positive prompt (built by the prompt-builder in 5.5.3). */
  prompt: string;
  /** Things to steer away from (text, logos, branded products, people, …). */
  negativePrompt?: string;
  /** Framing for the surface (hero = landscape, category = portrait, …). */
  aspect?: ImageAspect;
  /** Optional seed for reproducibility where the backend supports it. */
  seed?: number;
}

export interface GeneratedImage {
  /** Raw image bytes — stored in our own object storage, never hotlinked. */
  data: Buffer;
  mediaType: AIMediaType;
}

/** A single image backend (Stability, OpenAI, …). Kept intentionally minimal. */
export interface ImageProvider {
  readonly name: string;
  generate(request: ImageGenerationRequest): Promise<GeneratedImage>;
}

/**
 * Normalized failure reasons, so the branding layer handles every backend the
 * same way (e.g. `content_rejected` → fall back to curated stock / SVG).
 */
export type ImageErrorReason = "not_configured" | "content_rejected" | "rate_limited" | "timeout" | "provider_error";

export class ImageGenerationError extends Error {
  readonly reason: ImageErrorReason;
  /** Whether a retry could plausibly succeed (rate limits, timeouts, 5xx). */
  readonly retryable: boolean;

  constructor(reason: ImageErrorReason, message: string, retryable: boolean, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ImageGenerationError";
    this.reason = reason;
    this.retryable = retryable;
  }
}
