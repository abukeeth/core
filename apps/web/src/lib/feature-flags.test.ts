import { afterEach, describe, expect, it, vi } from "vitest";
import { isOnboardingV3Enabled } from "./feature-flags";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isOnboardingV3Enabled", () => {
  it("defaults OFF when the env var is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_ONBOARDING_V3", "");
    expect(isOnboardingV3Enabled()).toBe(false);
  });

  it.each(["1", "true", "TRUE", "on", "yes", " true "])("is ON for truthy value %j", (value) => {
    vi.stubEnv("NEXT_PUBLIC_ONBOARDING_V3", value);
    expect(isOnboardingV3Enabled()).toBe(true);
  });

  it.each(["0", "false", "off", "no", "disabled", "maybe"])("stays OFF for non-truthy value %j", (value) => {
    vi.stubEnv("NEXT_PUBLIC_ONBOARDING_V3", value);
    expect(isOnboardingV3Enabled()).toBe(false);
  });
});
