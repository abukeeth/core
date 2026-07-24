import OpenAI from "openai";
import { getNumberEnv, getStringEnv } from "../../../config/env";
import type { AICompletionRequest, AIProvider } from "../types";

const DEFAULT_MODEL = "gpt-4o";

export class OpenAIProvider implements AIProvider {
  readonly name = "openai";

  async complete({ text, images, maxTokens }: AICompletionRequest): Promise<string> {
    // Bound every call: the SDK default is a 10-minute timeout with 2 retries
    // (~30 min worst case), which let a slow request stall the whole generation
    // pipeline (the "Writing homepage copy…" hang). Fail fast instead — a
    // timeout surfaces as an error the caller already handles (fallback copy),
    // so generation stays bounded. Configurable via AI_REQUEST_TIMEOUT_MS.
    const client = new OpenAI({
      apiKey: getStringEnv("OPENAI_API_KEY", ""),
      timeout: getNumberEnv("AI_REQUEST_TIMEOUT_MS", 60_000),
      maxRetries: 1,
    });
    const model = getStringEnv("OPENAI_MODEL", DEFAULT_MODEL);

    const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      { type: "text", text },
      ...(images ?? []).map((image) => ({
        type: "image_url" as const,
        image_url: { url: `data:${image.mediaType};base64,${image.data.toString("base64")}` },
      })),
    ];

    const completion = await client.chat.completions.create({
      model,
      max_completion_tokens: maxTokens,
      messages: [{ role: "user", content }],
    });

    return completion.choices[0]?.message?.content ?? "";
  }
}
