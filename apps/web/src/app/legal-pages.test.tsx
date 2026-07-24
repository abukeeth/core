import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PrivacyPage from "./privacy/page";
import RefundPage from "./refund/page";
import TermsPage from "./terms/page";

describe("legal pages", () => {
  it("Terms renders with the counsel-review disclaimer and cross-links (not to itself)", () => {
    render(<TermsPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Terms of Service" })).toBeInTheDocument();
    expect(screen.getByText(/not legal advice/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Refund Policy" })).toHaveAttribute("href", "/refund");
    expect(screen.queryByRole("link", { name: "Terms of Service" })).not.toBeInTheDocument();
  });

  it("Privacy renders with the disclaimer and cross-links", () => {
    render(<PrivacyPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeInTheDocument();
    expect(screen.getByText(/not legal advice/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Terms of Service" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Refund Policy" })).toHaveAttribute("href", "/refund");
  });

  it("Refund renders and makes clear the merchant — not OrderVora — issues order refunds", () => {
    render(<RefundPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Refund Policy" })).toBeInTheDocument();
    expect(screen.getByText(/not legal advice/i)).toBeInTheDocument();
    expect(screen.getByText(/responsible for its orders and for any refund/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Terms of Service" })).toHaveAttribute("href", "/terms");
  });
});
