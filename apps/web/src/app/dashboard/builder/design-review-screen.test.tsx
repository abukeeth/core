import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/builder" }));

// The real DevicePreview needs a live /preview iframe + token endpoint;
// stub it to a marker so we can assert the review screen wires the correct
// selected version into the real-preview slot.
vi.mock("../website/variations/[id]/device-preview", () => ({
  DevicePreview: ({ siteId, variationId }: { siteId: string; variationId: string }) => (
    <div data-testid="real-preview">
      {siteId}:{variationId}
    </div>
  ),
}));

import { DesignReviewScreen } from "./design-review-screen";

function props(overrides: Record<string, unknown> = {}) {
  return {
    restaurantName: "Joe's Diner",
    siteId: "site-1",
    selectedVersionId: "v-best",
    phase: "review" as const,
    actionError: null as string | null,
    onApprove: vi.fn(),
    onRetryApprove: vi.fn(),
    onRetryPublish: vi.fn(),
    ...overrides,
  };
}

describe("DesignReviewScreen (approval gate — the owner-facing flow)", () => {
  it("shows the REAL preview of the selected design (not the build mockup)", () => {
    render(<DesignReviewScreen {...props()} />);
    expect(screen.getByTestId("real-preview")).toHaveTextContent("site-1:v-best");
  });

  it("review: shows 'Approve this design' and fires onApprove when clicked", () => {
    const onApprove = vi.fn();
    render(<DesignReviewScreen {...props({ onApprove })} />);
    const approve = screen.getByRole("button", { name: "Approve this design" });
    fireEvent.click(approve);
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it("review: offers a safe 'Choose another design' link to the variations page (no auto-publish)", () => {
    render(<DesignReviewScreen {...props()} />);
    const link = screen.getByRole("link", { name: "Choose another design" });
    expect(link).toHaveAttribute("href", "/dashboard/website/variations");
  });

  it("shows NO premature success claim at the review gate (nothing is public yet)", () => {
    render(<DesignReviewScreen {...props()} />);
    // The finale's success claims must not appear before publish is confirmed.
    expect(screen.queryByText(/open for business/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/you're live/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/officially open/i)).not.toBeInTheDocument();
    // It should instead reassure that nothing has gone public.
    expect(screen.getByText(/nothing is public yet/i)).toBeInTheDocument();
  });

  it("approving: shows an in-progress state and hides the approve button", () => {
    render(<DesignReviewScreen {...props({ phase: "approving" })} />);
    expect(screen.getByText(/Approving your design/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve this design" })).not.toBeInTheDocument();
  });

  it("publishing: shows a publishing-in-progress state (still no 'live' claim)", () => {
    render(<DesignReviewScreen {...props({ phase: "publishing" })} />);
    expect(screen.getByText(/Publishing your website/)).toBeInTheDocument();
    expect(screen.queryByText(/open for business/i)).not.toBeInTheDocument();
  });

  it("approve_failed: surfaces the error and a 'Try approving again' retry", () => {
    const onRetryApprove = vi.fn();
    render(<DesignReviewScreen {...props({ phase: "approve_failed", actionError: "approval service down", onRetryApprove })} />);
    expect(screen.getByText("approval service down")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try approving again" }));
    expect(onRetryApprove).toHaveBeenCalledTimes(1);
  });

  it("publish_failed: surfaces the readiness error and a 'Try publishing again' retry (publish-only)", () => {
    const onRetryPublish = vi.fn();
    render(
      <DesignReviewScreen
        {...props({ phase: "publish_failed", actionError: "Open the full preview and approve it before publishing.", onRetryPublish })}
      />,
    );
    expect(screen.getByText("Open the full preview and approve it before publishing.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try publishing again" }));
    expect(onRetryPublish).toHaveBeenCalledTimes(1);
  });

  it("preview unavailable: shows a clear message and disables approval when no design is selected", () => {
    render(<DesignReviewScreen {...props({ selectedVersionId: null })} />);
    expect(screen.getByText(/Preview unavailable right now/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve this design" })).toBeDisabled();
  });
});
