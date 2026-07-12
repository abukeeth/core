import { GoogleGenerativeAI } from "@google/generative-ai";
import { getStringEnv } from "../../../config/env";
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

    const result = await model.generateContent([
      text,
      ...(images ?? []).map((image) => ({
        inlineData: { mimeType: image.mediaType, data: image.data.toString("base64") },
      })),
    ]);

    return result.response.text();
  }
}
