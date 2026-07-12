import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
  },
}));

import { AnthropicProvider } from "./anthropic";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
});

describe("AnthropicProvider", () => {
  it("returns the first text block's content", async () => {
    mockCreate.mockResolvedValue({ content: [{ type: "text", text: "hello world" }] });

    const result = await new AnthropicProvider().complete({ text: "hi", maxTokens: 100 });

    expect(result).toBe("hello world");
  });

  it("returns an empty string when the response has no text block", async () => {
    mockCreate.mockResolvedValue({ content: [] });

    const result = await new AnthropicProvider().complete({ text: "hi", maxTokens: 100 });

    expect(result).toBe("");
  });

  it("sends attached images as base64 image blocks alongside the text block", async () => {
    mockCreate.mockResolvedValue({ content: [{ type: "text", text: "ok" }] });

    await new AnthropicProvider().complete({
      text: "describe this",
      images: [{ data: Buffer.from("fake-image"), mediaType: "image/png" }],
      maxTokens: 100,
    });

    const call = mockCreate.mock.calls[0]?.[0];
    expect(call.messages[0].content).toEqual([
      { type: "image", source: { type: "base64", media_type: "image/png", data: Buffer.from("fake-image").toString("base64") } },
      { type: "text", text: "describe this" },
    ]);
    expect(call.max_tokens).toBe(100);
  });
});
