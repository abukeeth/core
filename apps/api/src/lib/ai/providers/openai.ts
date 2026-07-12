import OpenAI from "openai";
import { getStringEnv } from "../../../config/env";
import type { AICompletionRequest, AIProvider } from "../types";

const DEFAULT_MODEL = "gpt-4o";

export class OpenAIProvider implements AIProvider {
  readonly name = "openai";

  async complete({ text, images, maxTokens }: AICompletionRequest): Promise<string> {
    const client = new OpenAI({ apiKey: getStringEnv("OPENAI_API_KEY", "") });
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
