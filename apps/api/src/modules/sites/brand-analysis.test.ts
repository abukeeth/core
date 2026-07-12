import { beforeEach, describe, expect, it, vi } from "vitest";

const mockComplete = vi.fn();

vi.mock("../../lib/ai", () => ({
  getAIProvider: () => ({ complete: mockComplete }),
}));

import { analyzeBrand } from "./brand-analysis";
import type { IngestData } from "./types";

beforeEach(() => {
  vi.clearAllMocks();
});

function ingest(overrides: Partial<IngestData> = {}): IngestData {
  return {
    restaurantId: "r1",
    restaurantName: "Trattoria Bella",
    menu: [{ categoryName: "Mains", name: "Spaghetti Carbonara", priceCents: 1800 }],
    photoCount: 3,
    ...overrides,
  };
}

function validAiResponse(overrides: Record<string, unknown> = {}) {
  return {
    cuisine: "italian",
    businessType: "bistro",
    priceTier: 3,
    personality: {
      traditionalContemporary: 0.4,
      casualFormal: 0.7,
      playfulSerious: 0.6,
      understatedBold: 0.3,
      rusticPolished: 0.7,
    },
    signalsUsed: ["menu language", "price points"],
    confidence: { cuisine: 0.9, businessType: 0.85, priceTier: 0.8, personality: 0.75 },
    ...overrides,
  };
}

describe("analyzeBrand", () => {
  it("parses a valid AI response into a BrandProfile", async () => {
    mockComplete.mockResolvedValue(JSON.stringify(validAiResponse()));

    const profile = await analyzeBrand(ingest());

    expect(profile.cuisine).toBe("italian");
    expect(profile.businessType).toBe("bistro");
    expect(profile.priceTier).toBe(3);
  });

  it("falls back to a safe default cuisine when confidence is below threshold", async () => {
    mockComplete.mockResolvedValue(JSON.stringify(validAiResponse({ confidence: { cuisine: 0.2, businessType: 0.85, priceTier: 0.8, personality: 0.75 } })));

    const profile = await analyzeBrand(ingest());

    expect(profile.cuisine).toBe("eclectic");
    expect(profile.businessType).toBe("bistro"); // untouched — its own confidence is high
  });

  it("falls back to a safe default personality when confidence is below threshold", async () => {
    mockComplete.mockResolvedValue(JSON.stringify(validAiResponse({ confidence: { cuisine: 0.9, businessType: 0.85, priceTier: 0.8, personality: 0.1 } })));

    const profile = await analyzeBrand(ingest());

    expect(profile.personality).toEqual({
      traditionalContemporary: 0.5,
      casualFormal: 0.5,
      playfulSerious: 0.5,
      understatedBold: 0.5,
      rusticPolished: 0.5,
    });
  });

  it("returns a safe-default profile (confidence 0) when the AI response fails schema validation", async () => {
    mockComplete.mockResolvedValue(JSON.stringify({ notARealShape: true }));

    const profile = await analyzeBrand(ingest());

    expect(profile.confidence.cuisine).toBe(0);
    expect(profile.cuisine).toBe("eclectic");
  });

  it("returns a safe-default profile when the response has no text block", async () => {
    mockComplete.mockResolvedValue("");

    const profile = await analyzeBrand(ingest());

    expect(profile.confidence.personality).toBe(0);
  });

  it("returns a safe-default profile when the API call throws", async () => {
    mockComplete.mockRejectedValue(new Error("network error"));

    const profile = await analyzeBrand(ingest());

    expect(profile).toEqual({
      cuisine: "eclectic",
      businessType: "casual dining",
      priceTier: 2,
      personality: {
        traditionalContemporary: 0.5,
        casualFormal: 0.5,
        playfulSerious: 0.5,
        understatedBold: 0.5,
        rusticPolished: 0.5,
      },
      signalsUsed: [],
      confidence: { cuisine: 0, businessType: 0, priceTier: 0, personality: 0 },
    });
  });

  it("never throws, even on malformed JSON", async () => {
    mockComplete.mockResolvedValue("not json at all");

    await expect(analyzeBrand(ingest())).resolves.toBeDefined();
  });
});
