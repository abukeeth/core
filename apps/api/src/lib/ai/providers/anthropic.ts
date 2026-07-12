import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { getStringEnv } from "../../../config/env";
import type { AICompletionRequest, AIProvider } from "../types";

const DEFAULT_MODEL = "claude-sonnet-5";

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";

  async complete({ text, images, maxTokens }: AICompletionRequest): Promise<string> {
    const client = new Anthropic({ apiKey: getStringEnv("ANTHROPIC_API_KEY", "") });
    const model = getStringEnv("ANTHROPIC_MODEL", DEFAULT_MODEL);

    const content: MessageParam["content"] = [
      ...(images ?? []).map((image) => ({
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: image.mediaType,
          data: image.data.toString("base64"),
        },
      })),
      { type: "text" as const, text },
    ];

    const message = await client.messages.create({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content }],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    return textBlock && textBlock.type === "text" ? textBlock.text : "";
  }
}
