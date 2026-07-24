import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyAIError, FallbackAIProvider, friendlyAIErrorMessage } from "./fallback";
import type { AICompletionRequest, AIProvider } from "../types";

const REQ: AICompletionRequest = { text: "hi", maxTokens: 16 };

function stubProvider(name: string, impl: () => Promise<string>): AIProvider {
  return { name, complete: impl };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("classifyAIError", () => {
  it("classifies HTTP 429 and quota text as quota", () => {
    expect(classifyAIError({ status: 429 })).toBe("quota");
    expect(classifyAIError(new Error("429 You exceeded your current quota"))).toBe("quota");
    expect(classifyAIError(new Error("insufficient_quota"))).toBe("quota");
  });

  it("classifies auth failures as auth", () => {
    expect(classifyAIError({ status: 401 })).toBe("auth");
    expect(classifyAIError(new Error("Incorrect API key provided"))).toBe("auth");
  });

  it("classifies 5xx / timeouts / network errors as unavailable", () => {
    expect(classifyAIError({ status: 503 })).toBe("unavailable");
    expect(classifyAIError(new Error("Request timed out"))).toBe("unavailable");
    expect(classifyAIError(new Error("ECONNRESET"))).toBe("unavailable");
  });

  it("falls back to unknown for anything else", () => {
    expect(classifyAIError(new Error("weird parse thing"))).toBe("unknown");
  });
});

describe("friendlyAIErrorMessage", () => {
  it("never leaks raw vendor detail or URLs to the owner", () => {
    const raw = new Error("429 You exceeded your current quota, see https://platform.openai.com/docs/errors");
    const friendly = friendlyAIErrorMessage(raw);
    expect(friendly).not.toContain("openai");
    expect(friendly).not.toContain("http");
    expect(friendly).not.toContain("429");
    expect(friendly.toLowerCase()).toContain("manually");
  });
});

describe("FallbackAIProvider", () => {
  it("returns the first provider's result without calling the others", async () => {
    const second = vi.fn(() => Promise.resolve("second"));
    const provider = new FallbackAIProvider([
      stubProvider("openai", () => Promise.resolve("first")),
      stubProvider("anthropic", second),
    ]);
    await expect(provider.complete(REQ)).resolves.toBe("first");
    expect(second).not.toHaveBeenCalled();
  });

  it("falls back to the next provider when the primary fails (e.g. OpenAI 429)", async () => {
    const provider = new FallbackAIProvider([
      stubProvider("openai", () => Promise.reject(Object.assign(new Error("quota"), { status: 429 }))),
      stubProvider("anthropic", () => Promise.resolve("rescued")),
    ]);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(provider.complete(REQ)).resolves.toBe("rescued");
  });

  it("throws a friendly, vendor-neutral message when every provider fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const provider = new FallbackAIProvider([
      stubProvider("openai", () => Promise.reject(Object.assign(new Error("429 quota https://platform.openai.com"), { status: 429 }))),
      stubProvider("anthropic", () => Promise.reject(new Error("overloaded"))),
    ]);
    await expect(provider.complete(REQ)).rejects.toThrow(/manually/i);
    await expect(provider.complete(REQ)).rejects.not.toThrow(/openai|429|http/i);
  });

  it("reports the primary provider's name", () => {
    const provider = new FallbackAIProvider([stubProvider("openai", () => Promise.resolve("x")), stubProvider("anthropic", () => Promise.resolve("y"))]);
    expect(provider.name).toBe("openai");
  });

  it("rejects construction with no providers", () => {
    expect(() => new FallbackAIProvider([])).toThrow(/at least one provider/);
  });
});
