import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../lib/safe-fetch", () => ({
  safeFetch: vi.fn(),
}));

import { safeFetch } from "../../../../lib/safe-fetch";
import { resolvePlaceId } from "./resolve-place-id";

const mockSafeFetch = vi.mocked(safeFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolvePlaceId", () => {
  it("returns a raw Place ID as-is", async () => {
    await expect(resolvePlaceId("ChIJN1t_tDeuEmsRUsoyG83frY4")).resolves.toBe("ChIJN1t_tDeuEmsRUsoyG83frY4");
    expect(mockSafeFetch).not.toHaveBeenCalled();
  });

  it("extracts a Place ID from a query parameter", async () => {
    const url = "https://www.google.com/maps/place/?query_place_id=ChIJN1t_tDeuEmsRUsoyG83frY4";
    await expect(resolvePlaceId(url)).resolves.toBe("ChIJN1t_tDeuEmsRUsoyG83frY4");
  });

  it("extracts a ChIJ-style Place ID embedded anywhere in the URL", async () => {
    const url = "https://www.google.com/maps/place/Some+Place/@1,2,3z/data=!1s0x0:0x0!ChIJN1t_tDeuEmsRUsoyG83frY4";
    await expect(resolvePlaceId(url)).resolves.toBe("ChIJN1t_tDeuEmsRUsoyG83frY4");
  });

  it("follows a maps.app.goo.gl short link before extracting the Place ID", async () => {
    mockSafeFetch.mockResolvedValue({
      buffer: Buffer.alloc(0),
      contentType: null,
      finalUrl: "https://www.google.com/maps/place/?query_place_id=ChIJN1t_tDeuEmsRUsoyG83frY4",
    });

    await expect(resolvePlaceId("https://maps.app.goo.gl/abc123")).resolves.toBe("ChIJN1t_tDeuEmsRUsoyG83frY4");
    expect(mockSafeFetch).toHaveBeenCalledWith("https://maps.app.goo.gl/abc123");
  });

  it("throws a clear error when no Place ID can be determined", async () => {
    await expect(resolvePlaceId("https://www.google.com/maps/place/Unrelated")).rejects.toThrow(
      /Could not determine a Google Place ID/,
    );
  });
});
