import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/launch",
}));

vi.mock("qrcode.react", () => ({
  QRCodeSVG: ({ value }: { value: string }) => <svg data-testid="qr-svg" data-value={value} />,
}));

import { LaunchCenter } from "./launch-center";
import type { Restaurant, SiteStatus } from "@/lib/api";

function restaurant(overrides: Partial<Restaurant> = {}): Restaurant {
  return {
    id: "rest-real-id-123",
    ownerId: "u1",
    name: "Joe's Diner",
    businessType: "RESTAURANT",
    setupStep: "DONE",
    description: null,
    address: null,
    lat: null,
    lng: null,
    phone: null,
    isPublished: true,
    isSuspended: false,
    suspendedReason: null,
    referralCode: "ABC123",
    ...overrides,
  };
}

describe("LaunchCenter — §M/K: QR code and Copy Link must use the same real URL", () => {
  it("builds the customer website URL from the real restaurant id, not a hardcoded slug or placeholder domain", () => {
    render(<LaunchCenter restaurant={restaurant()} siteStatus="PUBLISHED" />);

    const expectedUrl = `${window.location.origin}/order/rest-real-id-123`;
    expect(screen.getByText(expectedUrl)).toBeInTheDocument();
    expect(screen.queryByText(/placeholder\.example/)).not.toBeInTheDocument();
    expect(screen.queryByText(/sites\.ordervora\.example/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ordervora-web\.onrender\.com/)).not.toBeInTheDocument();
  });

  it("feeds the QR code the exact same URL shown in the Copy/Open row", () => {
    render(<LaunchCenter restaurant={restaurant()} siteStatus="PUBLISHED" />);

    const expectedUrl = `${window.location.origin}/order/rest-real-id-123`;
    expect(screen.getByTestId("qr-svg")).toHaveAttribute("data-value", expectedUrl);
    expect(screen.getByText(expectedUrl)).toBeInTheDocument();
  });
});

describe("LaunchCenter — Priority 2: ordering readiness is driven by the restaurant; website publishing is a separate optional status", () => {
  it("shows the QR, ordering link, and test order once the restaurant is published — even with no website", () => {
    render(<LaunchCenter restaurant={restaurant({ isPublished: true })} siteStatus={null} />);

    expect(screen.getByText("Joe's Diner is ready to take orders.")).toBeInTheDocument();
    expect(screen.getByTestId("qr-svg")).toBeInTheDocument();
    expect(screen.getByText("Customer website")).toBeInTheDocument();
    expect(screen.getByText("Test order flow")).toBeInTheDocument();
    // The old blocking "not published" copy must be gone.
    expect(screen.queryByText(/isn't taking orders yet/i)).not.toBeInTheDocument();
  });

  it("shows the website as an OPTIONAL upgrade (not a blocker) when it isn't published", () => {
    render(<LaunchCenter restaurant={restaurant({ isPublished: true })} siteStatus={"DRAFT" as SiteStatus} />);

    expect(screen.getByText("Joe's Diner is ready to take orders.")).toBeInTheDocument();
    expect(screen.getByText("Optional")).toBeInTheDocument();
    expect(screen.getByText("Build your website")).toBeInTheDocument();
  });

  it("shows the website status as Published when the site is live", () => {
    render(<LaunchCenter restaurant={restaurant({ isPublished: true })} siteStatus={"PUBLISHED" as SiteStatus} />);

    expect(screen.getByText("Published")).toBeInTheDocument();
    expect(screen.getByText("Manage website")).toBeInTheDocument();
  });

  it("still shows the live UI while the website is REPUBLISHING (last-good live version)", () => {
    render(<LaunchCenter restaurant={restaurant({ isPublished: true })} siteStatus={"REPUBLISHING" as SiteStatus} />);

    expect(screen.getByText("YOU'RE LIVE")).toBeInTheDocument();
    expect(screen.getByText("Published")).toBeInTheDocument();
  });

  it("shows a finish-setup state (not the live UI) only when the restaurant isn't published yet", () => {
    render(<LaunchCenter restaurant={restaurant({ isPublished: false })} siteStatus={"PUBLISHED" as SiteStatus} />);

    expect(screen.getByText(/isn't taking orders yet/i)).toBeInTheDocument();
    expect(screen.getByText("Finish setup")).toBeInTheDocument();
    expect(screen.queryByTestId("qr-svg")).not.toBeInTheDocument();
  });
});
