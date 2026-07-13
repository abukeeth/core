import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SiteVersion } from "@/lib/api";

const mockRollbackSite = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, rollbackSite: (...args: unknown[]) => mockRollbackSite(...args) };
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { PublishingHistory } from "./publishing-history";

function release(overrides: Partial<SiteVersion> = {}): SiteVersion {
  return {
    id: "v1",
    versionNo: 1,
    status: "ARCHIVED",
    publishedAt: "2026-07-01T00:00:00.000Z",
    publishedBy: { name: "Alex" },
    ...overrides,
  } as SiteVersion;
}

describe("PublishingHistory — §Website Builder rollback in the main hub", () => {
  it("shows a rollback button for a past release but not for the current one", () => {
    render(
      <PublishingHistory
        siteId="site-1"
        releases={[release({ id: "v2", versionNo: 2 }), release({ id: "v1", versionNo: 1 })]}
        currentVersionId="v2"
      />,
    );

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(screen.getByText("Version 2").closest("li")).not.toContainElement(
      screen.queryByRole("button", { name: /Roll back/ }),
    );
    expect(screen.getByRole("button", { name: /Roll back to this release/ })).toBeInTheDocument();
  });

  it("does not render a rollback button when siteId is not yet known", () => {
    render(<PublishingHistory siteId={null} releases={[release()]} currentVersionId={null} />);
    expect(screen.queryByRole("button", { name: /Roll back/ })).not.toBeInTheDocument();
  });
});
