import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getAIProvider } from "./index";

const KEYS = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"] as const;

function clearAllKeys() {
  for (const key of KEYS) delete process.env[key];
}

beforeEach(clearAllKeys);
afterEach(clearAllKeys);

describe("getAIProvider", () => {
  it("throws when no provider key is configured", () => {
    expect(() => getAIProvider()).toThrow(/No AI provider configured/);
  });

  it("selects OpenAI when only OPENAI_API_KEY is set", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    expect(getAIProvider().name).toBe("openai");
  });

  it("selects Anthropic when only ANTHROPIC_API_KEY is set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    expect(getAIProvider().name).toBe("anthropic");
  });

  it("selects Gemini when only GEMINI_API_KEY is set", () => {
    process.env.GEMINI_API_KEY = "gemini-test";
    expect(getAIProvider().name).toBe("gemini");
  });

  it("prefers OpenAI over Anthropic and Gemini when all three are set", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.GEMINI_API_KEY = "gemini-test";
    expect(getAIProvider().name).toBe("openai");
  });

  it("prefers Anthropic over Gemini when OpenAI is absent", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.GEMINI_API_KEY = "gemini-test";
    expect(getAIProvider().name).toBe("anthropic");
  });
});
