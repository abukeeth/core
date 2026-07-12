import { beforeEach, describe, expect, it, vi } from "vitest";

const mockComplete = vi.fn();

vi.mock("../../lib/ai", () => ({
  getAIProvider: () => ({ complete: mockComplete }),
}));

import { adaptToneForVariation, generateContentCore } from "./content-generator";
import type { BrandProfile, ContentCore, IngestData } from "./types";

beforeEach(() => {
  vi.clearAllMocks();
});

const ingest: IngestData = {
  restaurantId: "r1",
  restaurantName: "Trattoria Bella",
  menu: [{ categoryName: "Mains", name: "Spaghetti Carbonara", priceCents: 1800 }],
  photoCount: 3,
};

const brandProfile: BrandProfile = {
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
  signalsUsed: [],
  confidence: { cuisine: 0.9, businessType: 0.9, priceTier: 0.9, personality: 0.9 },
};

function validContentCore(overrides: Partial<ContentCore> = {}): ContentCore {
  return {
    tagline: "Handmade pasta, done right",
    heroHeadline: "Welcome to Trattoria Bella",
    heroSubhead: "Family recipes, fresh every day.",
    aboutStory: "Founded by a family of chefs.",
    signatureDishesIntro: "A few of our favorites.",
    galleryIntro: "A look inside our kitchen.",
    ctaLabel: "View Menu",
    ...overrides,
  };
}

describe("generateContentCore", () => {
  it("parses a valid AI response into a ContentCore", async () => {
    mockComplete.mockResolvedValue(JSON.stringify(validContentCore()));

    const core = await generateContentCore(ingest, brandProfile);

    expect(core.tagline).toBe("Handmade pasta, done right");
  });

  it("sanitizes banned claims out of the generated copy", async () => {
    mockComplete.mockResolvedValue(JSON.stringify(validContentCore({ heroSubhead: "The best pasta in the world." })));

    const core = await generateContentCore(ingest, brandProfile);

    expect(core.heroSubhead).not.toMatch(/best.*in the world/i);
  });

  it("falls back to templated copy when the AI response fails schema validation", async () => {
    mockComplete.mockResolvedValue(JSON.stringify({ notARealShape: true }));

    const core = await generateContentCore(ingest, brandProfile);

    expect(core.heroHeadline).toBe("Trattoria Bella");
    expect(core.aboutStory).toBe("[add your story]");
  });

  it("falls back to templated copy when the API call throws", async () => {
    mockComplete.mockRejectedValue(new Error("network error"));

    const core = await generateContentCore(ingest, brandProfile);

    expect(core.heroHeadline).toBe("Trattoria Bella");
  });

  it("never invents specific facts like address/phone/hours in the fallback", async () => {
    mockComplete.mockRejectedValue(new Error("network error"));

    const core = await generateContentCore(ingest, brandProfile);

    expect(JSON.stringify(core)).not.toMatch(/\d{3}[-.]?\d{4}/); // no phone-shaped strings
  });
});

describe("adaptToneForVariation", () => {
  const core = validContentCore();

  it("parses a valid tone-adapted response", async () => {
    mockComplete.mockResolvedValue(JSON.stringify(validContentCore({ heroHeadline: "Reserve Your Table Tonight" })));

    const adapted = await adaptToneForVariation(core, "LUXURY", ingest);

    expect(adapted.heroHeadline).toBe("Reserve Your Table Tonight");
  });

  it("falls back to the unadapted shared core when the AI response is invalid", async () => {
    mockComplete.mockResolvedValue(JSON.stringify({ garbage: true }));

    const adapted = await adaptToneForVariation(core, "MODERN", ingest);

    expect(adapted).toEqual(core);
  });

  it("falls back to the unadapted shared core when the API call throws", async () => {
    mockComplete.mockRejectedValue(new Error("network error"));

    const adapted = await adaptToneForVariation(core, "MINIMAL", ingest);

    expect(adapted).toEqual(core);
  });
});
