import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockReplace = vi.fn();
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, refresh: mockRefresh }),
}));

const mockLogin = vi.fn();
vi.mock("@/lib/api", () => ({
  login: (...args: unknown[]) => mockLogin(...args),
  hasApiErrorCode: (err: unknown, code: string) =>
    Boolean(err && typeof err === "object" && "code" in err && (err as { code?: string }).code === code),
}));

const mockGetOrCreateAuthRequestKey = vi.fn(() => "login:key-1");
const mockClearAuthRequestKey = vi.fn();
vi.mock("@/lib/auth-idempotency", () => ({
  getOrCreateAuthRequestKey: (...args: unknown[]) => mockGetOrCreateAuthRequestKey(...args),
  clearAuthRequestKey: (...args: unknown[]) => mockClearAuthRequestKey(...args),
}));

import LoginPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
});

function fillForm() {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "owner@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "hunter222" } });
}

describe("LoginPage", () => {
  it("navigates to dashboard on successful login", async () => {
    mockLogin.mockResolvedValue({ user: { id: "u1" }, loginState: "AUTHENTICATED" });
    render(<LoginPage />);
    fillForm();

    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/dashboard"));
    expect(mockLogin).toHaveBeenCalledWith("owner@example.com", "hunter222", true, { idempotencyKey: "login:key-1" });
    expect(mockClearAuthRequestKey).toHaveBeenCalledWith("login", "owner@example.com");
  });

  it("shows processing guidance for timeout/in-progress responses", async () => {
    mockLogin.mockRejectedValue(Object.assign(new Error("timed out"), { code: "REQUEST_TIMEOUT" }));
    render(<LoginPage />);
    fillForm();

    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() =>
      expect(
        screen.getByText("Login request is still being verified. Press Log in again in a moment to safely check the result."),
      ).toBeInTheDocument(),
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockReplace = vi.fn();
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, refresh: mockRefresh }),
}));

const mockLogin = vi.fn();
vi.mock("@/lib/api", () => ({
  login: (...args: unknown[]) => mockLogin(...args),
}));

import LoginPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LoginPage — §18: loading state must persist through navigation", () => {
  it("keeps 'Logging in…' visible and the button disabled after a successful login, not just until the request resolves", async () => {
    let resolveLogin: () => void = () => {};
    mockLogin.mockReturnValueOnce(new Promise<void>((resolve) => { resolveLogin = () => resolve(); }));

    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "hunter22" } });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    resolveLogin();
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/dashboard"));

    // Still showing the loading label/disabled button — never reverted just because login() resolved.
    expect(screen.getByRole("button", { name: "Logging in…" })).toBeDisabled();
  });

  it("prevents a duplicate submit while the first request is still in flight", async () => {
    mockLogin.mockReturnValue(new Promise(() => {})); // never resolves within this test
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "hunter22" } });

    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    fireEvent.click(screen.getByRole("button", { name: "Logging in…" }));
    fireEvent.click(screen.getByRole("button", { name: "Logging in…" }));

    expect(mockLogin).toHaveBeenCalledTimes(1);
  });

  it("shows a clear error and re-enables the button when login fails", async () => {
    mockLogin.mockRejectedValue(new Error("Invalid email or password"));
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => expect(screen.getByText("Invalid email or password")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Log in" })).not.toBeDisabled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
