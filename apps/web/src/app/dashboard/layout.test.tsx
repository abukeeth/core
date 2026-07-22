import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockServerFetch = vi.fn();
vi.mock("@/lib/server-api", () => ({
  serverFetch: (...args: unknown[]) => mockServerFetch(...args),
}));

class RedirectSignal extends Error {
  constructor(public url: string) {
    super(`REDIRECT:${url}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
  // BillingBanner (rendered inside the owner branch) reads the current path.
  usePathname: () => "/dashboard",
}));

vi.mock("./dashboard-load-error", () => ({
  DashboardLoadError: () => <div data-testid="load-error">load error</div>,
}));

import DashboardLayout from "./layout";

const CHILDREN = <div data-testid="children">dashboard</div>;

function ok<T>(data: T) {
  return { ok: true as const, data };
}
function httpFail(status: number) {
  return { ok: false as const, status, reason: "http" as const };
}
function transientFail(reason: "timeout" | "network" = "timeout") {
  return { ok: false as const, status: 503, reason };
}

function ownerMe() {
  return ok({ user: { id: "u1", role: "RESTAURANT_OWNER" } });
}

async function invoke() {
  return DashboardLayout({ children: CHILDREN });
}

async function expectRedirect(url: string) {
  await expect(invoke()).rejects.toMatchObject({ url });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DashboardLayout — Priority 1: transient failures must never bounce an existing owner back to setup", () => {
  it("renders children for a fully-onboarded owner (restaurant DONE)", async () => {
    mockServerFetch
      .mockResolvedValueOnce(ownerMe())
      .mockResolvedValueOnce(ok({ restaurant: { setupStep: "DONE" } }));

    render(await invoke());

    expect(screen.getByTestId("children")).toBeInTheDocument();
  });

  it("redirects a genuinely-new owner (restaurant 404) to /setup", async () => {
    mockServerFetch.mockResolvedValueOnce(ownerMe()).mockResolvedValueOnce(httpFail(404));
    await expectRedirect("/setup");
  });

  it("redirects an owner mid-setup (restaurant OK, step not DONE) to /setup", async () => {
    mockServerFetch
      .mockResolvedValueOnce(ownerMe())
      .mockResolvedValueOnce(ok({ restaurant: { setupStep: "BUSINESS_INFO" } }));
    await expectRedirect("/setup");
  });

  it("shows a retry state — NOT /setup — when GET /api/restaurants/me fails transiently (timeout)", async () => {
    mockServerFetch.mockResolvedValueOnce(ownerMe()).mockResolvedValueOnce(transientFail("timeout"));

    render(await invoke());

    expect(screen.getByTestId("load-error")).toBeInTheDocument();
    expect(screen.queryByTestId("children")).not.toBeInTheDocument();
  });

  it("shows a retry state — NOT /setup — when GET /api/restaurants/me returns 5xx", async () => {
    mockServerFetch.mockResolvedValueOnce(ownerMe()).mockResolvedValueOnce(httpFail(503));

    render(await invoke());

    expect(screen.getByTestId("load-error")).toBeInTheDocument();
  });

  it("redirects to /login when GET /api/restaurants/me returns 401", async () => {
    mockServerFetch.mockResolvedValueOnce(ownerMe()).mockResolvedValueOnce(httpFail(401));
    await expectRedirect("/login");
  });

  it("redirects to /login when GET /api/auth/me returns 401", async () => {
    mockServerFetch.mockResolvedValueOnce(httpFail(401));
    await expectRedirect("/login");
  });

  it("shows a retry state — NOT /login — when GET /api/auth/me fails transiently", async () => {
    mockServerFetch.mockResolvedValueOnce(transientFail("network"));

    render(await invoke());

    expect(screen.getByTestId("load-error")).toBeInTheDocument();
  });

  it("never fetches the restaurant (and never redirects to /setup) for non-owner roles", async () => {
    mockServerFetch.mockResolvedValueOnce(ok({ user: { id: "a1", role: "ADMIN" } }));

    render(await invoke());

    expect(screen.getByTestId("children")).toBeInTheDocument();
    expect(mockServerFetch).toHaveBeenCalledTimes(1);
  });
});
