import { getBooleanEnv, getNumberEnv, getStringEnv } from "../../../config/env";
import { LocalImageProvider } from "./providers/local";
import { OpenAIImageProvider } from "./providers/openai";
import { StabilityImageProvider } from "./providers/stability";
import { ImageGenerationError, type GeneratedImage, type ImageGenerationRequest, type ImageProvider } from "./types";

export type { GeneratedImage, ImageAspect, ImageErrorReason, ImageGenerationRequest, ImageProvider } from "./types";
export { ImageGenerationError } from "./types";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_BACKEND = "openai";

/**
 * Feature flag — AI image generation is OFF unless explicitly enabled, so it can
 * never fire (or bill) by accident before the branding pipeline (5.5.3) wires it.
 */
export function isImageGenerationEnabled(): boolean {
  return getBooleanEnv("AI_IMAGE_ENABLED", false);
}

/**
 * Backend registry — the single place a concrete provider is referenced. Adding
 * a provider = add a class under ./providers and one line here; nothing outside
 * `lib/ai/image/` imports a vendor class, so application code never changes.
 */
type ImageProviderFactory = () => ImageProvider;
const BACKENDS: Record<string, ImageProviderFactory> = {
  // Uses the OPENAI_API_KEY already configured for text (gpt-image-1 by default,
  // OPENAI_IMAGE_MODEL to override). The default backend so a deployment with an
  // OpenAI key set gets real photography with no extra provider config.
  openai: () => new OpenAIImageProvider(),
  stability: () => new StabilityImageProvider(),
  // Real, self-contained, keyless backend for dev / offline / demo. Selected via
  // AI_IMAGE_BACKEND=local (or per-vertical routes); swappable for a hosted
  // provider with no application-code change.
  local: () => new LocalImageProvider(),
};

/** Parse `AI_IMAGE_ROUTES` ("VAPE_SHOP=stability,COFFEE_SHOP=openai") into a map. */
function parseRoutes(raw: string): Record<string, string> {
  const routes: Record<string, string> = {};
  for (const pair of raw.split(",")) {
    const trimmed = pair.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && value) routes[key] = value;
  }
  return routes;
}

/**
 * Resolve the image backend for a business vertical — entirely from config: a
 * per-vertical routing map (`AI_IMAGE_ROUTES`) layered over a default backend
 * (`AI_IMAGE_BACKEND`). Callers pass a vertical, never a provider, so e.g.
 * `VAPE_SHOP` can be pinned to a permissive backend while food verticals use a
 * higher-fidelity one — with no code change.
 */
export function getImageProvider(vertical?: string): ImageProvider {
  const routes = parseRoutes(getStringEnv("AI_IMAGE_ROUTES", ""));
  const backend = (vertical ? routes[vertical] : undefined) ?? getStringEnv("AI_IMAGE_BACKEND", DEFAULT_BACKEND);
  const factory = BACKENDS[backend];
  if (!factory) {
    throw new ImageGenerationError(
      "not_configured",
      `Unknown AI image backend "${backend}". Register it in lib/ai/image or fix AI_IMAGE_BACKEND / AI_IMAGE_ROUTES.`,
      false,
    );
  }
  return factory();
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new ImageGenerationError("timeout", `AI image generation timed out after ${timeoutMs}ms`, true)),
      timeoutMs,
    );
    if (typeof timer.unref === "function") timer.unref();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function normalizeImageError(err: unknown): ImageGenerationError {
  if (err instanceof ImageGenerationError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new ImageGenerationError("provider_error", `AI image generation failed: ${message}`, false, { cause: err });
}

/**
 * The single entry point the branding layer (5.5.3) uses. Provider-agnostic:
 * applies the feature flag, config-driven vertical routing, a timeout, and
 * normalized `ImageGenerationError`s. Provider selection is injectable via
 * `provider` so callers/tests can bypass routing.
 */
export async function generateImage(
  request: ImageGenerationRequest,
  options: { vertical?: string; provider?: ImageProvider; timeoutMs?: number } = {},
): Promise<GeneratedImage> {
  if (!isImageGenerationEnabled()) {
    throw new ImageGenerationError("not_configured", "AI image generation is disabled (set AI_IMAGE_ENABLED=true)", false);
  }
  const provider = options.provider ?? getImageProvider(options.vertical);
  const timeoutMs = options.timeoutMs ?? getNumberEnv("AI_IMAGE_TIMEOUT_MS", DEFAULT_TIMEOUT_MS);
  try {
    return await withTimeout(provider.generate(request), timeoutMs);
  } catch (err) {
    throw normalizeImageError(err);
  }
}
