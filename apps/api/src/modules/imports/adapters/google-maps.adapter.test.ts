import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./google-maps/resolve-place-id", () => ({
  resolvePlaceId: vi.fn(),
}));

vi.mock("./google-maps/places-client", () => ({
  getPlaceDetails: vi.fn(),
  getPlacePhoto: vi.fn(),
}));

vi.mock("../vision-extractor", () => ({
  extractMenuFromImages: vi.fn(),
}));

vi.mock("../../../lib/file-storage", () => ({
  fileStorage: { save: vi.fn() },
}));

vi.mock("../../sites/renderer/asset-url", () => ({
  assetUrl: vi.fn(),
}));

vi.mock("./website.adapter", () => ({
  extractWebsiteData: vi.fn(),
}));

import { fileStorage } from "../../../lib/file-storage";
import { assetUrl } from "../../sites/renderer/asset-url";
import { extractMenuFromImages } from "../vision-extractor";
import { getPlaceDetails, getPlacePhoto } from "./google-maps/places-client";
import { resolvePlaceId } from "./google-maps/resolve-place-id";
import { extractWebsiteData } from "./website.adapter";
import { GoogleMapsImportAdapter } from "./google-maps.adapter";

const mockResolvePlaceId = vi.mocked(resolvePlaceId);
const mockGetPlaceDetails = vi.mocked(getPlaceDetails);
const mockGetPlacePhoto = vi.mocked(getPlacePhoto);
const mockExtractImages = vi.mocked(extractMenuFromImages);
const mockFileStorageSave = vi.mocked(fileStorage.save);
const mockAssetUrl = vi.mocked(assetUrl);
const mockExtractWebsiteData = vi.mocked(extractWebsiteData);

const adapter = new GoogleMapsImportAdapter();

beforeEach(() => {
  vi.clearAllMocks();
  mockFileStorageSave.mockResolvedValue({ path: "uploads/logo.jpg" });
  mockAssetUrl.mockReturnValue("https://cdn.example/uploads/logo.jpg");
  mockExtractWebsiteData.mockResolvedValue({ categories: [] });
});

describe("GoogleMapsImportAdapter", () => {
  it("reports itself as implemented and url-based", () => {
    expect(adapter.implemented).toBe(true);
    expect(adapter.inputKind).toBe("url");
  });

  it("builds a businessProfile from Places API fields when no photos exist", async () => {
    mockResolvePlaceId.mockResolvedValue("abc");
    mockGetPlaceDetails.mockResolvedValue({
      name: "Joe's Diner",
      address: "123 Main St",
      phone: "555-0100",
      photoNames: [],
    });

    const result = await adapter.extract({ kind: "url", url: "https://maps.google.com/?place_id=abc" });

    expect(result.businessProfile).toEqual({ name: "Joe's Diner", address: "123 Main St", phone: "555-0100" });
    expect(result.categories).toEqual([]);
    expect(mockGetPlacePhoto).not.toHaveBeenCalled();
  });

  it("merges profile fields with menu items extracted from up to 3 listing photos, reserving the first photo as a logo", async () => {
    mockResolvePlaceId.mockResolvedValue("abc");
    mockGetPlaceDetails.mockResolvedValue({
      name: "Joe's Diner",
      photoNames: ["p1", "p2", "p3", "p4"],
    });
    mockGetPlacePhoto.mockResolvedValue(Buffer.from("photo-bytes"));
    mockExtractImages.mockResolvedValue({ categories: [{ name: "Mains", items: [] }] });

    const result = await adapter.extract({ kind: "url", url: "https://maps.google.com/?place_id=abc" });

    // 1 logo fetch (p1) + 3 menu-photo fetches (p2, p3, p4)
    expect(mockGetPlacePhoto).toHaveBeenCalledTimes(4);
    expect(mockFileStorageSave).toHaveBeenCalledWith(Buffer.from("photo-bytes"), "logo.jpg");
    expect(result.businessProfile?.name).toBe("Joe's Diner");
    expect(result.businessProfile?.logoUrl).toBe("https://cdn.example/uploads/logo.jpg");
    expect(result.categories).toEqual([
      { name: "Mains", items: [] },
      { name: "Mains", items: [] },
      { name: "Mains", items: [] },
    ]);
  });

  it("surfaces website and hours from Places API into businessProfile", async () => {
    mockResolvePlaceId.mockResolvedValue("abc");
    mockGetPlaceDetails.mockResolvedValue({
      name: "Joe's Diner",
      website: "https://joesdiner.example",
      hours: ["Monday: 9:00 AM - 9:00 PM"],
      photoNames: [],
    });

    const result = await adapter.extract({ kind: "url", url: "https://maps.google.com/?place_id=abc" });

    expect(result.businessProfile?.website).toBe("https://joesdiner.example");
    expect(result.businessProfile?.hours).toEqual(["Monday: 9:00 AM - 9:00 PM"]);
  });

  it("auto-crawls the listing's website when one is present, merging its extraction", async () => {
    mockResolvePlaceId.mockResolvedValue("abc");
    mockGetPlaceDetails.mockResolvedValue({
      name: "Joe's Diner",
      website: "https://joesdiner.example",
      photoNames: [],
    });
    mockExtractWebsiteData.mockResolvedValue({ categories: [{ name: "From Website", items: [] }] });

    const result = await adapter.extract({ kind: "url", url: "https://maps.google.com/?place_id=abc" });

    expect(mockExtractWebsiteData).toHaveBeenCalledWith("https://joesdiner.example");
    expect(result.categories).toEqual([{ name: "From Website", items: [] }]);
  });

  it("does not attempt a website crawl when Places API returns no website", async () => {
    mockResolvePlaceId.mockResolvedValue("abc");
    mockGetPlaceDetails.mockResolvedValue({ name: "Joe's Diner", photoNames: [] });

    await adapter.extract({ kind: "url", url: "https://maps.google.com/?place_id=abc" });

    expect(mockExtractWebsiteData).not.toHaveBeenCalled();
  });

  it("still returns the Places-API-derived result when the website auto-crawl fails", async () => {
    mockResolvePlaceId.mockResolvedValue("abc");
    mockGetPlaceDetails.mockResolvedValue({
      name: "Joe's Diner",
      website: "https://joesdiner.example",
      photoNames: [],
    });
    mockExtractWebsiteData.mockRejectedValue(new Error("fetch failed"));

    const result = await adapter.extract({ kind: "url", url: "https://maps.google.com/?place_id=abc" });

    expect(result.businessProfile?.name).toBe("Joe's Diner");
  });

  it("does not fail the whole import when one photo fails to fetch or extract", async () => {
    mockResolvePlaceId.mockResolvedValue("abc");
    mockGetPlaceDetails.mockResolvedValue({ name: "Joe's Diner", photoNames: ["p1", "p2"] });
    mockGetPlacePhoto.mockRejectedValueOnce(new Error("photo unavailable"));
    mockGetPlacePhoto.mockResolvedValueOnce(Buffer.from("photo-bytes"));
    mockExtractImages.mockResolvedValue({ categories: [{ name: "Mains", items: [] }] });

    const result = await adapter.extract({ kind: "url", url: "https://maps.google.com/?place_id=abc" });

    expect(result.categories).toEqual([{ name: "Mains", items: [] }]);
  });

  it("rejects a non-url input", async () => {
    await expect(
      adapter.extract({ kind: "file", buffer: Buffer.from(""), mimeType: "application/pdf" }),
    ).rejects.toThrow();
  });
});
