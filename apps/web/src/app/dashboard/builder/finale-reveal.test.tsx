import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/builder",
}));

vi.mock("canvas-confetti", () => ({ default: vi.fn() }));

vi.mock("qrcode.react", () => ({
  QRCodeSVG: ({ value }: { value: string }) => <svg data-testid="qr-svg" data-value={value} />,
}));

vi.mock("../website/variations/[id]/device-preview", () => ({
  DevicePreview: ({ variationId }: { variationId: string }) => <div data-testid="device-preview">{variationId}</div>,
}));

import { FinaleReveal } from "./finale-reveal";

describe("FinaleReveal", () => {
  it("celebrates the restaurant by name and shows the live preview", () => {
    render(
      <FinaleReveal
        restaurantName="Joe's Diner"
        siteId="site-1"
        siteSlug="joes-diner"
        publishedVersionId="v-1"
        qrToken="tok-abc"
        qrError={null}
      />,
    );

    expect(screen.getByText(/Joe's Diner is officially open for business/)).toBeInTheDocument();
    expect(screen.getByTestId("device-preview")).toHaveTextContent("v-1");
  });

  it("renders a QR code encoding the customer ordering URL when a token exists", () => {
    render(
      <FinaleReveal
        restaurantName="Joe's Diner"
        siteId="site-1"
        siteSlug="joes-diner"
        publishedVersionId="v-1"
        qrToken="tok-abc"
        qrError={null}
      />,
    );

    expect(screen.getByTestId("qr-svg")).toHaveAttribute("data-value", expect.stringContaining("/order/qr/tok-abc"));
  });

  it("shows a friendly message instead of a broken QR code when provisioning failed", () => {
    render(
      <FinaleReveal
        restaurantName="Joe's Diner"
        siteId="site-1"
        siteSlug="joes-diner"
        publishedVersionId="v-1"
        qrToken={null}
        qrError="table service down"
      />,
    );

    expect(screen.queryByTestId("qr-svg")).not.toBeInTheDocument();
    expect(screen.getByText(/isn't ready yet/)).toBeInTheDocument();
  });

  it("offers next-step CTAs to the website, tables, and dashboard — with the restaurant itself as the primary payoff", () => {
    render(
      <FinaleReveal restaurantName="Joe's Diner" siteId="site-1" siteSlug="joes-diner" publishedVersionId={null} qrToken={null} qrError={null} />,
    );

    expect(screen.getByText("Open My Restaurant")).toBeInTheDocument();
    expect(screen.getByText("Manage QR codes")).toBeInTheDocument();
    expect(screen.getByText("Go to dashboard")).toBeInTheDocument();
  });

  it("keeps the celebration chime muted by default, with a visible toggle", () => {
    render(
      <FinaleReveal
        restaurantName="Joe's Diner"
        siteId="site-1"
        siteSlug="joes-diner"
        publishedVersionId="v-1"
        qrToken="tok-abc"
        qrError={null}
      />,
    );

    const toggle = screen.getByText("🔕 Sound off");
    expect(toggle).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByText("🔔 Sound on")).toBeInTheDocument();
  });
});
