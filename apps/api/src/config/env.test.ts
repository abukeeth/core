import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetEnvCacheForTests,
  assertStartupEnv,
  getEnv,
  getNumberEnv,
  getOptionalEnv,
  getSafeEnvSummary,
  getStringEnv,
  requireEnv,
} from "./env";

const CORE_KEYS = [
  "NODE_ENV",
  "PORT",
  "DATABASE_URL",
  "FRONTEND_URL",
  "JWT_ACCESS_SECRET",
  "JWT_ACCESS_TTL",
  "JWT_REFRESH_TTL",
  "COMMERCE_ENCRYPTION_KEY",
  "COMMERCE_ENCRYPTION_KEY_PREVIOUS",
] as const;

const originalEnv: Record<string, string | undefined> = {};
for (const key of CORE_KEYS) {
  originalEnv[key] = process.env[key];
}

function setValidCoreEnv(overrides: Record<string, string | undefined> = {}) {
  const base: Record<string, string> = {
    NODE_ENV: "development",
    PORT: "4000",
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/test",
    FRONTEND_URL: "http://localhost:3000",
    JWT_ACCESS_SECRET: "a-real-looking-secret-value",
    JWT_ACCESS_TTL: "15m",
    JWT_REFRESH_TTL: "30d",
    COMMERCE_ENCRYPTION_KEY: "a".repeat(64),
  };
  for (const [key, value] of Object.entries({ ...base, ...overrides })) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  __resetEnvCacheForTests();
}

function clearCoreEnv() {
  for (const key of CORE_KEYS) {
    delete process.env[key];
  }
  __resetEnvCacheForTests();
}

afterEach(() => {
  for (const key of CORE_KEYS) {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }
  __resetEnvCacheForTests();
});

describe("getEnv / assertStartupEnv (Production Hardening Phase 3 — strict startup validation)", () => {
  it("returns the parsed, typed config when every required variable is present and valid", () => {
    setValidCoreEnv();
    const env = getEnv();
    expect(env.DATABASE_URL).toBe("postgresql://postgres:postgres@localhost:5432/test");
    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(4000);
  });

  it("memoizes — a second call returns the same result without re-reading process.env", () => {
    setValidCoreEnv();
    const first = getEnv();
    process.env.DATABASE_URL = "postgresql://changed/after-first-call";
    const second = getEnv();
    expect(second).toBe(first);
    expect(second.DATABASE_URL).toBe("postgresql://postgres:postgres@localhost:5432/test");
  });

  it("throws a single aggregated error listing every missing required variable at once", () => {
    clearCoreEnv();
    expect(() => getEnv()).toThrow(/DATABASE_URL/);
    try {
      getEnv();
      expect.unreachable("getEnv() should have thrown");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toMatch(/DATABASE_URL/);
      expect(message).toMatch(/FRONTEND_URL/);
      expect(message).toMatch(/JWT_ACCESS_SECRET/);
      expect(message).toMatch(/JWT_ACCESS_TTL/);
      expect(message).toMatch(/JWT_REFRESH_TTL/);
      expect(message).toMatch(/COMMERCE_ENCRYPTION_KEY/);
    }
  });

  it("assertStartupEnv() throws the exact same way as getEnv() when config is invalid", () => {
    clearCoreEnv();
    expect(() => assertStartupEnv()).toThrow(/Invalid environment configuration/);
  });

  it("applies defaults for NODE_ENV (development) and PORT (4000) when unset", () => {
    setValidCoreEnv({ NODE_ENV: undefined, PORT: undefined });
    const env = getEnv();
    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(4000);
  });

  it("rejects an invalid NODE_ENV value not in the known set", () => {
    setValidCoreEnv({ NODE_ENV: "staging-typo" });
    expect(() => getEnv()).toThrow();
  });

  it("accepts staging and test as valid environments alongside development/production", () => {
    setValidCoreEnv({ NODE_ENV: "staging" });
    expect(getEnv().NODE_ENV).toBe("staging");

    setValidCoreEnv({ NODE_ENV: "test" });
    expect(getEnv().NODE_ENV).toBe("test");
  });

  it("rejects a COMMERCE_ENCRYPTION_KEY that isn't a 64-character hex string", () => {
    setValidCoreEnv({ COMMERCE_ENCRYPTION_KEY: "not-hex-and-wrong-length" });
    expect(() => getEnv()).toThrow(/COMMERCE_ENCRYPTION_KEY/);
  });

  it("accepts an optional COMMERCE_ENCRYPTION_KEY_PREVIOUS for key rotation", () => {
    setValidCoreEnv({ COMMERCE_ENCRYPTION_KEY_PREVIOUS: "b".repeat(64) });
    expect(getEnv().COMMERCE_ENCRYPTION_KEY_PREVIOUS).toBe("b".repeat(64));
  });

  describe("production-only placeholder rejection", () => {
    it("rejects the exact .env.example JWT_ACCESS_SECRET placeholder when NODE_ENV=production", () => {
      setValidCoreEnv({ NODE_ENV: "production", JWT_ACCESS_SECRET: "replace-with-a-random-256-bit-secret" });
      expect(() => getEnv()).toThrow(/JWT_ACCESS_SECRET is still set to the \.env\.example placeholder/);
    });

    it("rejects the exact .env.example COMMERCE_ENCRYPTION_KEY placeholder when NODE_ENV=production", () => {
      // Won't even reach the placeholder check via the hex-format rule if the string isn't valid hex —
      // use a placeholder that happens to still be checked defensively regardless of format validity.
      setValidCoreEnv({ NODE_ENV: "production" });
      process.env.COMMERCE_ENCRYPTION_KEY = "replace-with-a-random-32-byte-hex-value";
      __resetEnvCacheForTests();
      expect(() => getEnv()).toThrow();
    });

    it("allows the same placeholder-shaped values in development (no production check applied)", () => {
      setValidCoreEnv({ NODE_ENV: "development", JWT_ACCESS_SECRET: "replace-with-a-random-256-bit-secret" });
      expect(() => getEnv()).not.toThrow();
    });

    it("allows a real, non-placeholder secret in production", () => {
      setValidCoreEnv({ NODE_ENV: "production", JWT_ACCESS_SECRET: "a-genuinely-random-generated-secret-value" });
      expect(() => getEnv()).not.toThrow();
    });
  });
});

describe("requireEnv (Phase 3 — shared single-var helper, replaces 5 duplicated local copies)", () => {
  beforeEach(() => {
    delete process.env.SOME_TEST_VAR;
  });

  it("returns the value when the variable is set", () => {
    process.env.SOME_TEST_VAR = "hello";
    expect(requireEnv("SOME_TEST_VAR")).toBe("hello");
  });

  it("throws a clear error naming the variable when it's missing", () => {
    expect(() => requireEnv("SOME_TEST_VAR")).toThrow(/SOME_TEST_VAR/);
  });

  it("throws when the variable is set to an empty string", () => {
    process.env.SOME_TEST_VAR = "";
    expect(() => requireEnv("SOME_TEST_VAR")).toThrow(/SOME_TEST_VAR/);
  });

  describe("production-only placeholder rejection", () => {
    const originalNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv;
    });

    it("rejects a .env.example placeholder value in production — e.g. ADMIN_PASSWORD left at its committed default", () => {
      process.env.NODE_ENV = "production";
      process.env.SOME_TEST_VAR = "replace-with-a-strong-password";
      expect(() => requireEnv("SOME_TEST_VAR")).toThrow(/placeholder value/);
    });

    it("allows the same placeholder-looking string outside production (dev/test)", () => {
      process.env.NODE_ENV = "test";
      process.env.SOME_TEST_VAR = "replace-with-a-strong-password";
      expect(requireEnv("SOME_TEST_VAR")).toBe("replace-with-a-strong-password");
    });

    it("allows a genuine, non-placeholder value in production", () => {
      process.env.NODE_ENV = "production";
      process.env.SOME_TEST_VAR = "a-genuinely-random-generated-value";
      expect(requireEnv("SOME_TEST_VAR")).toBe("a-genuinely-random-generated-value");
    });
  });
});

describe("getStringEnv", () => {
  beforeEach(() => {
    delete process.env.SOME_STRING_VAR;
  });

  it("returns the default when unset", () => {
    expect(getStringEnv("SOME_STRING_VAR", "fallback")).toBe("fallback");
  });

  it("returns the actual value when set", () => {
    process.env.SOME_STRING_VAR = "actual";
    expect(getStringEnv("SOME_STRING_VAR", "fallback")).toBe("actual");
  });

  it("returns the default for an empty string (not the empty string itself)", () => {
    process.env.SOME_STRING_VAR = "";
    expect(getStringEnv("SOME_STRING_VAR", "fallback")).toBe("fallback");
  });
});

describe("getNumberEnv", () => {
  beforeEach(() => {
    delete process.env.SOME_NUMBER_VAR;
  });

  it("returns the default when unset", () => {
    expect(getNumberEnv("SOME_NUMBER_VAR", 42)).toBe(42);
  });

  it("parses a numeric string when set", () => {
    process.env.SOME_NUMBER_VAR = "123";
    expect(getNumberEnv("SOME_NUMBER_VAR", 42)).toBe(123);
  });

  it("throws a clear error for a non-numeric value rather than returning NaN", () => {
    process.env.SOME_NUMBER_VAR = "not-a-number";
    expect(() => getNumberEnv("SOME_NUMBER_VAR", 42)).toThrow(/must be a number/);
  });
});

describe("getOptionalEnv", () => {
  it("returns undefined when unset", () => {
    delete process.env.SOME_OPTIONAL_VAR;
    expect(getOptionalEnv("SOME_OPTIONAL_VAR")).toBeUndefined();
  });

  it("returns the value when set", () => {
    process.env.SOME_OPTIONAL_VAR = "present";
    expect(getOptionalEnv("SOME_OPTIONAL_VAR")).toBe("present");
    delete process.env.SOME_OPTIONAL_VAR;
  });
});

describe("getSafeEnvSummary (Phase 3 — \"no secret values can appear in logs\")", () => {
  it("reports every known key as set or unset, never the underlying value", () => {
    setValidCoreEnv();
    const summary = getSafeEnvSummary();

    expect(summary.DATABASE_URL).toBe("set");
    expect(summary.JWT_ACCESS_SECRET).toBe("set");
    expect(JSON.stringify(summary)).not.toContain("postgresql://postgres:postgres@localhost:5432/test");
    expect(JSON.stringify(summary)).not.toContain("a-real-looking-secret-value");
  });

  it("reports an unset key correctly", () => {
    clearCoreEnv();
    delete process.env.ANTHROPIC_API_KEY;
    const summary = getSafeEnvSummary();
    expect(summary.ANTHROPIC_API_KEY).toBe("unset");
    expect(summary.DATABASE_URL).toBe("unset");
  });
});
