import { getOptionalEnv } from "../../config/env";
import { AnthropicProvider } from "./providers/anthropic";
import { GeminiProvider } from "./providers/gemini";
import { OpenAIProvider } from "./providers/openai";
import type { AIProvider } from "./types";

export type { AICompletionRequest, AIImageInput, AIMediaType, AIProvider } from "./types";

/**
 * Every AI feature (menu import, brand analysis, content generation, the
 * Brand Consistency judge) goes through this single selection point rather
 * than instantiating a vendor SDK directly — swapping providers is an
 * environment-variable change, never an application-code change.
 *
 * Priority (first configured key wins): OpenAI, then Anthropic, then
 * Gemini. Re-evaluated on every call rather than memoized, matching the
 * rest of the codebase's lazy-env-read pattern (see lib/prisma.ts) so
 * tests never need a real key set.
 */
export function getAIProvider(): AIProvider {
  if (getOptionalEnv("OPENAI_API_KEY")) return new OpenAIProvider();
  if (getOptionalEnv("ANTHROPIC_API_KEY")) return new AnthropicProvider();
  if (getOptionalEnv("GEMINI_API_KEY")) return new GeminiProvider();
  throw new Error("No AI provider configured — set one of OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY");
}
