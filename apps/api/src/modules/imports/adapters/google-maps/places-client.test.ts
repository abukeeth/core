import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPlaceDetails, getPlacePhoto } from "./places-client";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getPlaceDetails", () => {
  it("maps the Places API response into PlaceDetails", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          displayName: { text: "Joe's Diner" },
          formattedAddress: "123 Main St",
          internationalPhoneNumber: "+1 555-0100",
          websiteUri: "https://joesdiner.example",
          regularOpeningHours: { weekdayDescriptions: ["Monday: 9:00 AM - 9:00 PM"] },
          photos: [{ name: "places/abc/photos/1" }, { name: "places/abc/photos/2" }],
        }),
        { status: 200 },
      ),
    );

    const details = await getPlaceDetails("abc");

    expect(details).toEqual({
      name: "Joe's Diner",
      address: "123 Main St",
      phone: "+1 555-0100",
      website: "https://joesdiner.example",
      hours: ["Monday: 9:00 AM - 9:00 PM"],
      photoNames: ["places/abc/photos/1", "places/abc/photos/2"],
    });
  });

  it("omits website/hours when the Places API doesn't return them", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ displayName: { text: "Joe's Diner" }, photos: [] }), { status: 200 }),
    );

    const details = await getPlaceDetails("abc");

    expect(details.website).toBeUndefined();
    expect(details.hours).toBeUndefined();
  });

  it("throws when the API responds with a non-2xx status", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404 }));

    await expect(getPlaceDetails("missing")).rejects.toThrow(/404/);
  });
});

describe("getPlacePhoto", () => {
  it("returns the photo bytes as a Buffer", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));

    const buffer = await getPlacePhoto("places/abc/photos/1");

    expect(Array.from(buffer)).toEqual([1, 2, 3]);
  });
});
