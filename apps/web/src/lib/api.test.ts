import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, createConsolidatedImport, forgotPassword, login, resendVerification } from "./api";

describe("apiFetch — timeout and network error mapping", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("surfaces a timeout-specific error instead of assuming a cold start", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError")),
    );

    await expect(login("owner@example.com", "hunter2")).rejects.toMatchObject({
      code: "REQUEST_TIMEOUT",
      message: expect.stringMatching(/request timed out/i),
    });
  });

  it("also maps a manually-aborted request (AbortError) to the same clear timeout message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("The operation was aborted", "AbortError")));

    await expect(login("owner@example.com", "hunter2")).rejects.toMatchObject({
      code: "REQUEST_TIMEOUT",
    });
  });

  it("surfaces a distinct message for a genuine network failure (no server reachable at all)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(login("owner@example.com", "hunter2")).rejects.toMatchObject({
      code: "NETWORK_UNREACHABLE",
      message: expect.stringMatching(/couldn't reach the server/i),
    });
  });

  it("passes an AbortSignal on every request so a hang is actually bounded", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: "u1" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await login("owner@example.com", "hunter2");

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("still surfaces the API's own error message for a normal (non-network) failed request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "Invalid credentials", code: "AUTHENTICATION_FAILED" }),
    }));

    await expect(login("owner@example.com", "wrong")).rejects.toMatchObject({
      code: "AUTHENTICATION_FAILED",
      message: expect.stringMatching(/authentication failed/i),
    });
  });

  it("resolves normally on a healthy response, unaffected by the added timeout wiring", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: "u1", email: "owner@example.com" } }),
    }));

    const result = await login("owner@example.com", "hunter2");
    expect(result.user.id).toBe("u1");
  });

  it("maps resend delivery failures to EMAIL_DELIVERY_FAILED", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: "Could not deliver", code: "EMAIL_DELIVERY_FAILED" }),
    }));

    await expect(resendVerification()).rejects.toMatchObject({
      code: "EMAIL_DELIVERY_FAILED",
      message: expect.stringMatching(/email delivery failed/i),
    });
  });

  it("maps unknown 5xx failures to service temporarily unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "Internal server error" }),
    }));

    await expect(forgotPassword("owner@example.com")).rejects.toMatchObject({
      code: "SERVICE_TEMPORARILY_UNAVAILABLE",
      message: expect.stringMatching(/temporarily unavailable/i),
    });
  });

  it("throws AUTH_REQUEST_IN_PROGRESS when login returns an accepted in-progress state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({ error: "Login is still processing", code: "AUTH_REQUEST_IN_PROGRESS" }),
    }));

    const err = await login("owner@example.com", "hunter2").catch((caught) => caught);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect((err as ApiRequestError).code).toBe("AUTH_REQUEST_IN_PROGRESS");
  });

  it("surfaces the HTTP status when the failed response body is not the API's JSON (e.g. a proxy/misroute HTML 404)", async () => {
    // Reproduces the double-slash `//api/...` 404 that broke prod register/login:
    // the body is an HTML error page, so res.json() rejects and data is null.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => {
        throw new SyntaxError("Unexpected token '<'");
      },
    }));

    const err = await login("owner@example.com", "hunter2").catch((caught) => caught);
    expect(err).toBeInstanceOf(ApiRequestError);
    // No longer a bare "Request failed" — the status makes the misroute diagnosable.
    expect((err as ApiRequestError).message).toMatch(/HTTP 404/);
    expect((err as ApiRequestError).status).toBe(404);
  });
});

describe("createConsolidatedImport (Onboarding V3)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("posts every file plus the optional URLs as multipart to /api/imports/consolidated", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ job: { id: "multi-1", sourceType: "MULTI", status: "PENDING" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { job } = await createConsolidatedImport({
      files: [new File(["a"], "a.jpg", { type: "image/jpeg" }), new File(["b"], "menu.pdf", { type: "application/pdf" })],
      websiteUrl: "https://example.com",
      googleMapsUrl: "https://maps.google.com/x",
    });

    expect(job.id).toBe("multi-1");
    const [path, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/imports/consolidated");
    expect(options.method).toBe("POST");
    const body = options.body as FormData;
    expect(body.getAll("files")).toHaveLength(2);
    expect(body.get("websiteUrl")).toBe("https://example.com");
    expect(body.get("googleMapsUrl")).toBe("https://maps.google.com/x");
  });

  it("omits URL fields when not provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ job: { id: "multi-2" } }) });
    vi.stubGlobal("fetch", fetchMock);

    await createConsolidatedImport({ files: [new File(["a"], "a.jpg", { type: "image/jpeg" })] });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = options.body as FormData;
    expect(body.has("websiteUrl")).toBe(false);
    expect(body.has("googleMapsUrl")).toBe(false);
  });

  it("surfaces the API error message on a failed upload", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "Upload at least one source — an image, a PDF, a website URL, or a Google Maps URL." }),
    }));

    await expect(createConsolidatedImport({ files: [] })).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/at least one source/i),
    });
  });
});
