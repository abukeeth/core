import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  updateSite: vi.fn(),
}));

import { EditTemporaryDomain } from "./edit-temporary-domain";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EditTemporaryDomain — §M path-based fallback vs. subdomain formats", () => {
  it("correctly extracts the slug from the /store/<slug> fallback URL (not the domain's first segment)", () => {
    render(<EditTemporaryDomain siteId="site-1" current="https://ordervora.com/store/trattoria-bella" onDone={() => {}} />);

    const input = screen.getByDisplayValue("trattoria-bella");
    expect(input).toBeInTheDocument();
    // The fixed, non-editable part shown around the input should be the real
    // domain/path, not a hardcoded, no-longer-accurate ".ordervora.app" string.
    expect(screen.getByText("ordervora.com/store/")).toBeInTheDocument();
    expect(screen.queryByText(".ordervora.app")).not.toBeInTheDocument();
  });

  it("still correctly extracts the slug once wildcard DNS is active and the URL is subdomain-based", () => {
    render(<EditTemporaryDomain siteId="site-1" current="https://trattoria-bella.ordervora.com" onDone={() => {}} />);

    expect(screen.getByDisplayValue("trattoria-bella")).toBeInTheDocument();
    expect(screen.getByText(".ordervora.com")).toBeInTheDocument();
  });
});
