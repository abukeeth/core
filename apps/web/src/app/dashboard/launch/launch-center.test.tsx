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
    render(<LaunchCenter restaurant={restaurant} />);

    const expectedUrl = `${window.location.origin}/order/${restaurant.id}`;
    expect(screen.getByText(expectedUrl)).toBeInTheDocument();
    expect(screen.queryByText(/placeholder\.example/)).not.toBeInTheDocument();
    expect(screen.queryByText(/sites\.ordervora\.example/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ordervora-web\.onrender\.com/)).not.toBeInTheDocument();
  });

  it("feeds the QR code the exact same URL shown in the Copy/Open row", () => {
    render(<LaunchCenter restaurant={restaurant} />);

    const expectedUrl = `${window.location.origin}/order/${restaurant.id}`;
    expect(screen.getByTestId("qr-svg")).toHaveAttribute("data-value", expectedUrl);
    expect(screen.getByText(expectedUrl)).toBeInTheDocument();
  });
});
