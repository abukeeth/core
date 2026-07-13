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

const TIMEOUT_MESSAGE = "The server is taking longer than expected to respond — it may be waking up. Please try again in a moment.";
const mockRegister = vi.fn();
const mockLogin = vi.fn();
vi.mock("@/lib/api", () => ({
  register: (...args: unknown[]) => mockRegister(...args),
  login: (...args: unknown[]) => mockLogin(...args),
  isTimeoutMessage: (message: string) => message === TIMEOUT_MESSAGE,
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
  });

  it("on a timeout, retries via login with the same credentials instead of immediately showing failure", async () => {
    mockRegister.mockRejectedValue(new Error(TIMEOUT_MESSAGE));
    mockLogin.mockResolvedValue({ user: { id: "u1" } });
    render(<RegisterPage />);
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Create business account" }));

    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith("joe@example.com", "hunter222"));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/dashboard"));
    expect(screen.queryByText(/Registration failed/)).not.toBeInTheDocument();
  });

  it("shows a real failure if the timeout-triggered login retry also fails (account genuinely wasn't created)", async () => {
    mockRegister.mockRejectedValue(new Error(TIMEOUT_MESSAGE));
    mockLogin.mockRejectedValue(new Error("Invalid email or password"));
    render(<RegisterPage />);
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Create business account" }));

    await waitFor(() => expect(screen.getByText(TIMEOUT_MESSAGE)).toBeInTheDocument());
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("shows the real error directly for a genuine (non-timeout) failure, e.g. email already in use", async () => {
    mockRegister.mockRejectedValue(new Error("Email already in use"));
    render(<RegisterPage />);
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Create business account" }));

    await waitFor(() => expect(screen.getByText("Email already in use")).toBeInTheDocument());
    expect(mockLogin).not.toHaveBeenCalled();
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
