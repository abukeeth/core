import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPush = vi.fn();
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

vi.mock("@/lib/referral-storage", () => ({
  setStoredReferralCode: vi.fn(),
}));

const mockRegister = vi.fn();
const { mockGetOrCreateAuthRequestKey, mockClearAuthRequestKey } = vi.hoisted(() => ({
  mockGetOrCreateAuthRequestKey: vi.fn(() => "signup:key-1"),
  mockClearAuthRequestKey: vi.fn(),
}));

vi.mock("@/lib/auth-idempotency", () => ({
  getOrCreateAuthRequestKey: mockGetOrCreateAuthRequestKey,
  clearAuthRequestKey: mockClearAuthRequestKey,
}));

vi.mock("@/lib/api", () => ({
  register: (...args: unknown[]) => mockRegister(...args),
  hasApiErrorCode: (err: unknown, code: string) =>
    Boolean(err && typeof err === "object" && "code" in err && (err as { code?: string }).code === code),
}));

import RegisterPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
});

function fillForm() {
  fireEvent.change(screen.getByLabelText("Owner name"), { target: { value: "Joe Smith" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "joe@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "hunter222" } });
}

describe("RegisterPage — §17: a client-side timeout must not report failure for a signup that actually succeeded", () => {
  it("continues to the dashboard on a normal, fast success", async () => {
    mockRegister.mockResolvedValue({ user: { id: "u1" } });
    render(<RegisterPage />);
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Create business account" }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/dashboard"));
    expect(mockRegister).toHaveBeenCalledWith("joe@example.com", "hunter222", "Joe Smith", { idempotencyKey: "signup:key-1" });
    expect(mockClearAuthRequestKey).toHaveBeenCalledWith("signup", "joe@example.com");
  });

  it("on timeout, retries signup reconciliation with the same idempotency key", async () => {
    const timeoutError = Object.assign(new Error("Request timed out"), { code: "REQUEST_TIMEOUT" });
    mockRegister.mockRejectedValueOnce(timeoutError).mockResolvedValueOnce({ user: { id: "u1" } });
    render(<RegisterPage />);
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Create business account" }));

    await waitFor(() => expect(mockRegister).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/dashboard"));
    expect(mockRegister).toHaveBeenNthCalledWith(1, "joe@example.com", "hunter222", "Joe Smith", { idempotencyKey: "signup:key-1" });
    expect(mockRegister).toHaveBeenNthCalledWith(2, "joe@example.com", "hunter222", "Joe Smith", { idempotencyKey: "signup:key-1" });
  });

  it("shows a deterministic pending message when timeout reconciliation still isn't ready", async () => {
    const timeoutError = Object.assign(new Error("Request timed out"), { code: "REQUEST_TIMEOUT" });
    const inProgressError = Object.assign(new Error("Signup is still in progress"), { code: "AUTH_REQUEST_IN_PROGRESS" });
    mockRegister.mockRejectedValueOnce(timeoutError).mockRejectedValueOnce(inProgressError);
    render(<RegisterPage />);
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Create business account" }));

    await waitFor(() => expect(screen.getByText("Signup is still in progress")).toBeInTheDocument());
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("shows the real error directly for a genuine (non-timeout) failure, e.g. email already in use", async () => {
    mockRegister.mockRejectedValue(new Error("Email already in use"));
    render(<RegisterPage />);
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Create business account" }));

    await waitFor(() => expect(screen.getByText("Email already in use")).toBeInTheDocument());
    expect(mockClearAuthRequestKey).toHaveBeenCalledWith("signup", "joe@example.com");
  });

  it("prevents a duplicate submit while the first request is still in flight", async () => {
    mockRegister.mockReturnValue(new Promise(() => {}));
    render(<RegisterPage />);
    fillForm();

    fireEvent.click(screen.getByRole("button", { name: "Create business account" }));
    fireEvent.click(screen.getByRole("button", { name: "Creating account…" }));
    fireEvent.click(screen.getByRole("button", { name: "Creating account…" }));

    expect(mockRegister).toHaveBeenCalledTimes(1);
  });
});
