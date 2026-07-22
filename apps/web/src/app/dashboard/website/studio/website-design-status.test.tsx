import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  createSite: vi.fn(),
  startGeneration: vi.fn(),
  regenerateVariations: vi.fn(),
  getGenerationStatus: vi.fn(),
}));

import { WebsiteDesignStatus } from "./website-design-status";

function job(overrides: Partial<{ status: string; stage: string; error: string | null }> = {}) {
  return { id: "job-1", siteId: "site-1", batchId: "b1", stage: "INGEST", status: "RUNNING", error: null, ...overrides } as never;
}

describe("WebsiteDesignStatus — replaces the old simulated AI Brand Concepts mock", () => {
  it("shows a real Generate button (no simulated concepts) when no site exists yet", () => {
    render(<WebsiteDesignStatus siteId={null} job={null} variations={[]} />);

    expect(screen.getByText("Generate your website with AI")).toBeInTheDocument();
    expect(screen.getByText("Generate my storefront")).toBeInTheDocument();
    expect(screen.queryByText(/Concept A|Concept B|Concept C/)).not.toBeInTheDocument();
  });

  it("shows the real generation progress while a job is running, not a fake timer", () => {
    render(<WebsiteDesignStatus siteId="site-1" job={job({ status: "RUNNING" })} variations={[]} />);

    expect(screen.getByText("Building three designs for you")).toBeInTheDocument();
    expect(screen.queryByText(/Designing your brand concepts/)).not.toBeInTheDocument();
  });

  it("prompts to generate when a site exists but has no variations and no active job", () => {
    render(<WebsiteDesignStatus siteId="site-1" job={null} variations={[]} />);

    expect(screen.getByText("No designs generated yet")).toBeInTheDocument();
  });

  it("shows the real variation count and best real score once designs exist", () => {
    const variations = [
      { id: "v1", siteId: "site-1", versionNo: 1, definition: {} as never, status: "DRAFT", styleFamily: "MODERN", generationBatchId: "b1", publishedAt: null, createdAt: "now", scores: [{ overall: 88 }] } as never,
      { id: "v2", siteId: "site-1", versionNo: 2, definition: {} as never, status: "DRAFT", styleFamily: "LUXURY", generationBatchId: "b1", publishedAt: null, createdAt: "now", scores: [{ overall: 95 }] } as never,
    ];

    render(<WebsiteDesignStatus siteId="site-1" job={null} variations={variations} />);

    expect(screen.getByText("2 real designs ready to compare")).toBeInTheDocument();
    expect(screen.getByText("Best score 95/100")).toBeInTheDocument();
    expect(screen.getByText("Compare designs")).toBeInTheDocument();
  });
});
