import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreate = vi.fn();

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockCreate } };
  },
}));

import { OpenAIProvider } from "./openai";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENAI_API_KEY = "sk-test";
});

describe("OpenAIProvider", () => {
  it("returns the first choice's message content", async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: "hello world" } }] });

    const result = await new OpenAIProvider().complete({ text: "hi", maxTokens: 100 });

    expect(result).toBe("hello world");
  });

  it("returns an empty string when there are no choices", async () => {
    mockCreate.mockResolvedValue({ choices: [] });

    const result = await new OpenAIProvider().complete({ text: "hi", maxTokens: 100 });

    expect(result).toBe("");
  });

  it("sends attached images as data-URL image_url parts alongside the text part", async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: "ok" } }] });

    await new OpenAIProvider().complete({
      text: "describe this",
      images: [{ data: Buffer.from("fake-image"), mediaType: "image/png" }],
      maxTokens: 100,
    });

    const call = mockCreate.mock.calls[0]?.[0];
    expect(call.messages[0].content).toEqual([
      { type: "text", text: "describe this" },
      { type: "image_url", image_url: { url: `data:image/png;base64,${Buffer.from("fake-image").toString("base64")}` } },
    ]);
    expect(call.max_completion_tokens).toBe(100);
  });
});
