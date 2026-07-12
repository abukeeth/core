import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({
  default: { lookup: vi.fn() },
}));

import dns from "node:dns/promises";
import { safeFetch, SafeFetchError } from "./safe-fetch";

const mockLookup = vi.mocked(dns.lookup);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function textResponse(body: string, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(body, { status: init.status ?? 200, headers: init.headers });
}

describe("safeFetch", () => {
  it("rejects non-http(s) schemes before ever resolving DNS", async () => {
    await expect(safeFetch("ftp://example.com/file")).rejects.toBeInstanceOf(SafeFetchError);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it("rejects a URL that resolves to a private IP", async () => {
    mockLookup.mockResolvedValue({ address: "192.168.1.10", family: 4 });

    await expect(safeFetch("http://internal.example.com/")).rejects.toBeInstanceOf(SafeFetchError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects the cloud metadata endpoint", async () => {
    mockLookup.mockResolvedValue({ address: "169.254.169.254", family: 4 });

    await expect(safeFetch("http://169.254.169.254/latest/meta-data")).rejects.toBeInstanceOf(SafeFetchError);
  });

  it("rejects loopback", async () => {
    mockLookup.mockResolvedValue({ address: "127.0.0.1", family: 4 });

    await expect(safeFetch("http://localhost/")).rejects.toBeInstanceOf(SafeFetchError);
  });

  it("allows a public IP and returns the response body", async () => {
    mockLookup.mockResolvedValue({ address: "93.184.216.34", family: 4 });
    vi.mocked(fetch).mockResolvedValue(textResponse("hello world"));

    const result = await safeFetch("http://example.com/");

    expect(result.buffer.toString("utf-8")).toBe("hello world");
  });

  it("follows a redirect and re-validates the redirect target", async () => {
    mockLookup.mockResolvedValueOnce({ address: "93.184.216.34", family: 4 });
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: "http://internal.example.com/" } }),
    );
    mockLookup.mockResolvedValueOnce({ address: "10.0.0.5", family: 4 });

    await expect(safeFetch("http://example.com/")).rejects.toBeInstanceOf(SafeFetchError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("gives up after too many redirects", async () => {
    mockLookup.mockResolvedValue({ address: "93.184.216.34", family: 4 });
    vi.mocked(fetch).mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "http://example.com/next" } }),
    );

    await expect(safeFetch("http://example.com/")).rejects.toBeInstanceOf(SafeFetchError);
  });

  it("rejects a response advertising a size over the cap via Content-Length", async () => {
    mockLookup.mockResolvedValue({ address: "93.184.216.34", family: 4 });
    vi.mocked(fetch).mockResolvedValue(textResponse("x", { headers: { "content-length": "999999999" } }));

    await expect(safeFetch("http://example.com/", { maxBytes: 100 })).rejects.toBeInstanceOf(SafeFetchError);
  });

  it("rejects a streamed response that exceeds the cap with no Content-Length", async () => {
    mockLookup.mockResolvedValue({ address: "93.184.216.34", family: 4 });
    vi.mocked(fetch).mockResolvedValue(textResponse("a".repeat(1000)));

    await expect(safeFetch("http://example.com/", { maxBytes: 10 })).rejects.toBeInstanceOf(SafeFetchError);
  });
});
