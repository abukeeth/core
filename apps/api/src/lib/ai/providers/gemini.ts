import { GoogleGenerativeAI } from "@google/generative-ai";
import { getNumberEnv, getStringEnv } from "../../../config/env";
import type { AICompletionRequest, AIProvider } from "../types";

const DEFAULT_MODEL = "gemini-2.0-flash";

export class GeminiProvider implements AIProvider {
  readonly name = "gemini";

  async complete({ text, images, maxTokens }: AICompletionRequest): Promise<string> {
    const client = new GoogleGenerativeAI(getStringEnv("GEMINI_API_KEY", ""));
    const model = client.getGenerativeModel({
      model: getStringEnv("GEMINI_MODEL", DEFAULT_MODEL),
      generationConfig: { maxOutputTokens: maxTokens },
    });

    // The Gemini SDK has no built-in request timeout, so bound the call here so
    // a slow/hung request can't stall the generation pipeline (see openai.ts).
    // Configurable via AI_REQUEST_TIMEOUT_MS.
    const timeoutMs = getNumberEnv("AI_REQUEST_TIMEOUT_MS", 60_000);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Gemini request timed out after ${timeoutMs}ms`)), timeoutMs);
    });

    try {
      const result = await Promise.race([
        model.generateContent([
          text,
          ...(images ?? []).map((image) => ({
            inlineData: { mimeType: image.mediaType, data: image.data.toString("base64") },
          })),
        ]),
        timeout,
      ]);
      return result.response.text();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
