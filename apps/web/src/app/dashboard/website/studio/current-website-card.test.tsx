import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("qrcode.react", () => ({
  QRCodeSVG: ({ value }: { value: string }) => <svg data-testid="qr-svg" data-value={value} />,
}));

import { CurrentWebsiteCard } from "./current-website-card";

describe("CurrentWebsiteCard — §10: Open Website/Copy Link/Share/QR must not present as live actions before publishing succeeds", () => {
  it.each([null, "DRAFT", "PUBLISHING", "FAILED", "UNPUBLISHED"] as const)(
    "hides Open Website/QR/Copy/Share when status is %s",
    (status) => {
      render(<CurrentWebsiteCard domain="https://www.ordervora.com/store/joes-diner" status={status} />);

      expect(screen.queryByRole("link", { name: /Open Website/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Copy Link/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /QR Code/ })).not.toBeInTheDocument();
      expect(screen.getByText(/Publish your website/)).toBeInTheDocument();
    },
  );

  it("shows all live actions once the site is actually PUBLISHED", () => {
    render(<CurrentWebsiteCard domain="https://www.ordervora.com/store/joes-diner" status="PUBLISHED" />);

    expect(screen.getByRole("link", { name: /Open Website/ })).toHaveAttribute("href", "https://www.ordervora.com/store/joes-diner");
    expect(screen.getByRole("button", { name: /Copy Link/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /QR Code/ })).toBeInTheDocument();
  });

  it("also shows live actions while REPUBLISHING (still serving the last-good live version)", () => {
    render(<CurrentWebsiteCard domain="https://www.ordervora.com/store/joes-diner" status="REPUBLISHING" />);

    expect(screen.getByRole("link", { name: /Open Website/ })).toBeInTheDocument();
  });
});
