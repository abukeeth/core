import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockForgotPassword = vi.fn();
vi.mock("@/lib/api", () => ({
  forgotPassword: (...args: unknown[]) => mockForgotPassword(...args),
  hasApiErrorCode: (err: unknown, code: string) =>
    Boolean(err && typeof err === "object" && "code" in err && (err as { code?: string }).code === code),
}));

const { mockGetOrCreateAuthRequestKey, mockClearAuthRequestKey } = vi.hoisted(() => ({
  mockGetOrCreateAuthRequestKey: vi.fn(() => "forgot:key-1"),
  mockClearAuthRequestKey: vi.fn(),
}));
vi.mock("@/lib/auth-idempotency", () => ({
  getOrCreateAuthRequestKey: mockGetOrCreateAuthRequestKey,
  clearAuthRequestKey: mockClearAuthRequestKey,
}));

import ForgotPasswordPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ForgotPasswordPage", () => {
  it("shows accepted wording instead of falsely guaranteeing delivery", async () => {
    mockForgotPassword.mockResolvedValue({
      ok: true,
      state: "REQUEST_ACCEPTED",
      delivery: "PENDING",
      message: "Password reset request accepted. If an account exists, you will receive an email shortly.",
    });
    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "owner@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() =>
      expect(screen.getByText("Password reset request accepted. If an account exists, you will receive an email shortly.")).toBeInTheDocument(),
    );
    expect(mockClearAuthRequestKey).toHaveBeenCalledWith("forgot-password", "owner@example.com");
  });

  it("shows processing guidance when request status is uncertain", async () => {
    mockForgotPassword.mockRejectedValue(Object.assign(new Error("pending"), { code: "AUTH_REQUEST_IN_PROGRESS" }));
    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "owner@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() =>
      expect(screen.getByText("Password reset request is still processing. Retry in a moment to confirm the result.")).toBeInTheDocument(),
    );
  });
});
