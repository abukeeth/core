/**
 * Provider-agnostic media type union — deliberately not imported from any
 * one vendor's SDK (previously `Base64ImageSource["media_type"]` from
 * `@anthropic-ai/sdk`), so adapters that build image inputs don't carry a
 * dependency on whichever provider happens to be configured.
 */
export type AIMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export interface AIImageInput {
  data: Buffer;
  mediaType: AIMediaType;
}

export interface AICompletionRequest {
  /** The text portion of the prompt (instructions + any inlined content). */
  text: string;
  /** Optional images to attach, e.g. for menu photo extraction. */
  images?: AIImageInput[];
  maxTokens: number;
}

export interface AIProvider {
  readonly name: string;
  /** Returns the model's raw text response (empty string if it produced none). */
  complete(request: AICompletionRequest): Promise<string>;
}
