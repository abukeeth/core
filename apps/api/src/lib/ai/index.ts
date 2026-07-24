import { getOptionalEnv } from "../../config/env";
import { AnthropicProvider } from "./providers/anthropic";
import { FallbackAIProvider } from "./providers/fallback";
import { GeminiProvider } from "./providers/gemini";
import { OpenAIProvider } from "./providers/openai";
import type { AIProvider } from "./types";

export type { AICompletionRequest, AIImageInput, AIMediaType, AIProvider } from "./types";

/** Every configured provider, in priority order (first is preferred). */
function configuredProviders(): AIProvider[] {
  const providers: AIProvider[] = [];
  if (getOptionalEnv("OPENAI_API_KEY")) providers.push(new OpenAIProvider());
  if (getOptionalEnv("ANTHROPIC_API_KEY")) providers.push(new AnthropicProvider());
  if (getOptionalEnv("GEMINI_API_KEY")) providers.push(new GeminiProvider());
  return providers;
}

/**
 * Every AI feature (menu import, brand analysis, content generation, the
 * Brand Consistency judge) goes through this single selection point rather
 * than instantiating a vendor SDK directly — swapping providers is an
 * environment-variable change, never an application-code change.
 *
 * Priority (preferred first): OpenAI, then Anthropic, then Gemini. The
 * returned provider is a FallbackAIProvider that tries the preferred vendor
 * first and transparently falls back to the next configured one if it fails
 * (e.g. OpenAI is out of quota with a 429) — so a single vendor's outage no
 * longer takes the whole product down, and the owner never sees a raw vendor
 * error. Re-evaluated on every call (not memoized), matching the codebase's
 * lazy-env-read pattern (see lib/prisma.ts) so tests never need a real key.
 */
export function getAIProvider(): AIProvider {
  const providers = configuredProviders();
  if (providers.length === 0) {
    throw new Error("No AI provider configured — set one of OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY");
  }
  return new FallbackAIProvider(providers);
}
