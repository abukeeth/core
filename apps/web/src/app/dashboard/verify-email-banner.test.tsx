import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mockResendVerification = vi.fn();
vi.mock("@/lib/api", () => ({
  resendVerification: () => mockResendVerification(),
}));

import { VerifyEmailBanner } from "./verify-email-banner";

describe("VerifyEmailBanner (Sprint 19B-3)", () => {
  it("shows the sent confirmation when the email actually goes out", async () => {
    mockResendVerification.mockResolvedValue({ ok: true });
    render(<VerifyEmailBanner />);

    fireEvent.click(screen.getByRole("button", { name: "Resend email" }));

    await waitFor(() => expect(screen.getByText("Verification email sent — check your inbox.")).toBeInTheDocument());
  });

  it("surfaces a real error instead of silently claiming success when the send fails", async () => {
    mockResendVerification.mockRejectedValue(new Error("Could not send the verification email. Please try again in a few minutes."));
    render(<VerifyEmailBanner />);

    fireEvent.click(screen.getByRole("button", { name: "Resend email" }));

    await waitFor(() =>
      expect(screen.getByText("Could not send the verification email. Please try again in a few minutes.")).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByText("Verification email sent — check your inbox.")).not.toBeInTheDocument();
  });
});
