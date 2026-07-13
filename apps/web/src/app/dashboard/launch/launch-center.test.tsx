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
import type { Restaurant } from "@/lib/api";

const restaurant = { id: "rest-real-id-123", name: "Joe's Diner" } as Restaurant;

describe("LaunchCenter — §M/K: QR code and Copy Link must use the same real URL", () => {
  it("builds the customer website URL from the real restaurant id, not a hardcoded slug or placeholder domain", () => {
    render(<LaunchCenter restaurant={restaurant} siteStatus="PUBLISHED" />);

    const expectedUrl = `${window.location.origin}/order/${restaurant.id}`;
    expect(screen.getByText(expectedUrl)).toBeInTheDocument();
    expect(screen.queryByText(/placeholder\.example/)).not.toBeInTheDocument();
    expect(screen.queryByText(/sites\.ordervora\.example/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ordervora-web\.onrender\.com/)).not.toBeInTheDocument();
  });

  it("feeds the QR code the exact same URL shown in the Copy/Open row", () => {
    render(<LaunchCenter restaurant={restaurant} siteStatus="PUBLISHED" />);

    const expectedUrl = `${window.location.origin}/order/${restaurant.id}`;
    expect(screen.getByTestId("qr-svg")).toHaveAttribute("data-value", expectedUrl);
    expect(screen.getByText(expectedUrl)).toBeInTheDocument();
  });
});

describe("LaunchCenter — §10: Live/QR/Test Order must not show before publishing succeeds", () => {
  it.each([null, "DRAFT", "PUBLISHING", "FAILED", "UNPUBLISHED"] as const)(
    "hides Live/QR/Test Order when siteStatus is %s",
    (status) => {
      render(<LaunchCenter restaurant={restaurant} siteStatus={status} />);

      expect(screen.queryByText("YOU'RE LIVE")).not.toBeInTheDocument();
      expect(screen.queryByTestId("qr-svg")).not.toBeInTheDocument();
      expect(screen.queryByText("Test order flow")).not.toBeInTheDocument();
      expect(screen.getByText(/isn't published yet/)).toBeInTheDocument();
    },
  );

  it("shows Live/QR/Test Order once the site is actually PUBLISHED", () => {
    render(<LaunchCenter restaurant={restaurant} siteStatus="PUBLISHED" />);

    expect(screen.getByText("YOU'RE LIVE")).toBeInTheDocument();
    expect(screen.getByTestId("qr-svg")).toBeInTheDocument();
    expect(screen.getByText("Test order flow")).toBeInTheDocument();
  });

  it("also shows Live/QR/Test Order while REPUBLISHING (still the last-good live version)", () => {
    render(<LaunchCenter restaurant={restaurant} siteStatus="REPUBLISHING" />);

    expect(screen.getByText("YOU'RE LIVE")).toBeInTheDocument();
  });
});
