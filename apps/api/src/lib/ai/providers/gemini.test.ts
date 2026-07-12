import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGenerateContent = vi.fn();
const mockGetGenerativeModel = vi.fn(() => ({ generateContent: mockGenerateContent }));

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class MockGoogleGenerativeAI {
    getGenerativeModel = mockGetGenerativeModel;
  },
}));

import { GeminiProvider } from "./gemini";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GEMINI_API_KEY = "gemini-test";
});

describe("GeminiProvider", () => {
  it("returns the response's assembled text", async () => {
    mockGenerateContent.mockResolvedValue({ response: { text: () => "hello world" } });

    const result = await new GeminiProvider().complete({ text: "hi", maxTokens: 100 });

    expect(result).toBe("hello world");
  });

  it("sends attached images as inlineData parts alongside the text part", async () => {
    mockGenerateContent.mockResolvedValue({ response: { text: () => "ok" } });

    await new GeminiProvider().complete({
      text: "describe this",
      images: [{ data: Buffer.from("fake-image"), mediaType: "image/png" }],
      maxTokens: 100,
    });

    const parts = mockGenerateContent.mock.calls[0]?.[0];
    expect(parts).toEqual(["describe this", { inlineData: { mimeType: "image/png", data: Buffer.from("fake-image").toString("base64") } }]);
    expect(mockGetGenerativeModel).toHaveBeenCalledWith(expect.objectContaining({ generationConfig: { maxOutputTokens: 100 } }));
  });
});
