import { describe, expect, it } from "vitest";
import type { GenerationJob, SiteVersion, WebsiteSite } from "@/lib/api";
import { computeBuilderStage } from "./builder-stage";

function site(overrides: Partial<WebsiteSite> = {}): WebsiteSite {
  return {
    id: "site-1",
    restaurantId: "restaurant-1",
    slug: "joes-diner",
    status: "DRAFT",
    themeId: null,
    themeVersion: null,
    publishedVersionId: null,
    brandProfile: null,
    settings: null,
    previewApprovedAt: null,
    ...overrides,
  };
}

function job(overrides: Partial<GenerationJob> = {}): GenerationJob {
  return { id: "job-1", siteId: "site-1", batchId: "batch-1", stage: "INGEST", status: "PENDING", error: null, createdAt: "2026-07-14T00:00:00.000Z", ...overrides };
}

describe("computeBuilderStage — §Website Builder MENU_READY..LIVE (no fake progress)", () => {
  it("is MENU_READY before any site exists", () => {
    expect(computeBuilderStage(null, null, [], false)).toBe("MENU_READY");
  });

  it("is WEBSITE_GENERATING while the generation job is running", () => {
    expect(computeBuilderStage(site(), job({ status: "RUNNING" }), [], false)).toBe("WEBSITE_GENERATING");
  });

  it("is DESIGNS_READY once variations exist and no draft has been selected yet", () => {
    expect(computeBuilderStage(site(), job({ status: "COMPLETED" }), [{ id: "v1" } as SiteVersion], false)).toBe("DESIGNS_READY");
  });

  it("is PREVIEW_READY once a draft exists but is not yet approved (also covers DESIGN_SELECTED)", () => {
    expect(computeBuilderStage(site(), null, [], true)).toBe("PREVIEW_READY");
  });

  it("is PREVIEW_APPROVED once the owner has approved the preview", () => {
    expect(computeBuilderStage(site({ previewApprovedAt: "2026-07-13T00:00:00.000Z" }), null, [], true)).toBe("PREVIEW_APPROVED");
  });

  it("is PUBLISHING while the site is being published or republished", () => {
    expect(computeBuilderStage(site({ status: "PUBLISHING", previewApprovedAt: "2026-07-13T00:00:00.000Z" }), null, [], true)).toBe(
      "PUBLISHING",
    );
    expect(computeBuilderStage(site({ status: "REPUBLISHING", previewApprovedAt: "2026-07-13T00:00:00.000Z" }), null, [], true)).toBe(
      "PUBLISHING",
    );
  });

  it("is LIVE only once the site has actually published successfully", () => {
    expect(computeBuilderStage(site({ status: "PUBLISHED", publishedVersionId: "v1" }), null, [], true)).toBe("LIVE");
  });

  it("falls back to PREVIEW_READY after a failed publish attempt, since previewApprovedAt is untouched on failure", () => {
    expect(computeBuilderStage(site({ status: "FAILED", previewApprovedAt: "2026-07-13T00:00:00.000Z" }), null, [], true)).toBe(
      "PREVIEW_APPROVED",
    );
  });

  it("requires re-approval after unpublish, since publishing always clears previewApprovedAt on success", () => {
    expect(computeBuilderStage(site({ status: "UNPUBLISHED", publishedVersionId: "v1", previewApprovedAt: null }), null, [], true)).toBe(
      "PREVIEW_READY",
    );
  });
});
