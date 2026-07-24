import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Both flows are stubbed — this test only proves the flag routes to the right one.
vi.mock("./legacy-wizard", () => ({ LegacyWizard: () => <div>Legacy Wizard</div> }));
vi.mock("./v3/onboarding-v3", () => ({ OnboardingV3: () => <div>Onboarding V3</div> }));

import BusinessSetupPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/setup flag gate", () => {
  it("renders Onboarding V3 by default when the flag is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_ONBOARDING_V3", "");
    render(<BusinessSetupPage />);
    expect(screen.getByText("Onboarding V3")).toBeInTheDocument();
    expect(screen.queryByText("Legacy Wizard")).not.toBeInTheDocument();
  });

  it("renders the legacy wizard only when explicitly opted out", () => {
    vi.stubEnv("NEXT_PUBLIC_ONBOARDING_V3", "false");
    render(<BusinessSetupPage />);
    expect(screen.getByText("Legacy Wizard")).toBeInTheDocument();
    expect(screen.queryByText("Onboarding V3")).not.toBeInTheDocument();
  });
});
