import { afterEach, describe, expect, it, vi } from "vitest";
import { isOnboardingV3Enabled } from "./feature-flags";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isOnboardingV3Enabled", () => {
  it("defaults ON when the env var is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_ONBOARDING_V3", "");
    expect(isOnboardingV3Enabled()).toBe(true);
  });

  it.each(["0", "false", "FALSE", "off", "no", " false "])("is OFF (legacy) for falsy value %j", (value) => {
    vi.stubEnv("NEXT_PUBLIC_ONBOARDING_V3", value);
    expect(isOnboardingV3Enabled()).toBe(false);
  });

  it.each(["1", "true", "on", "yes", "enabled", "maybe"])("stays ON for any non-falsy value %j", (value) => {
    vi.stubEnv("NEXT_PUBLIC_ONBOARDING_V3", value);
    expect(isOnboardingV3Enabled()).toBe(true);
  });
});
