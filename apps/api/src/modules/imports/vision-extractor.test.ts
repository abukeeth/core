import { beforeEach, describe, expect, it, vi } from "vitest";

const mockComplete = vi.fn();

vi.mock("../../lib/ai", () => ({
  getAIProvider: () => ({ complete: mockComplete }),
}));

import { extractJsonObjectText, extractMenuFromImages, extractMenuFromText } from "./vision-extractor";

beforeEach(() => {
  vi.clearAllMocks();
});

const MENU_JSON = JSON.stringify({
  categories: [{ name: "Mains", items: [{ name: "Burger", priceCents: 1200 }] }],
});

describe("extractJsonObjectText", () => {
  it("returns clean JSON unchanged", () => {
    expect(extractJsonObjectText(MENU_JSON)).toBe(MENU_JSON);
  });

  it("strips a ```json code fence", () => {
    expect(JSON.parse(extractJsonObjectText("```json\n" + MENU_JSON + "\n```"))).toEqual(JSON.parse(MENU_JSON));
  });

  it("strips a bare ``` code fence", () => {
    expect(JSON.parse(extractJsonObjectText("```\n" + MENU_JSON + "\n```"))).toEqual(JSON.parse(MENU_JSON));
  });

  it("recovers JSON wrapped in preamble/trailing prose", () => {
    const wrapped = "Here is the extracted menu:\n" + MENU_JSON + "\nLet me know if you need anything else.";
    expect(JSON.parse(extractJsonObjectText(wrapped))).toEqual(JSON.parse(MENU_JSON));
  });

  it("returns the trimmed input when there is no object span", () => {
    expect(extractJsonObjectText("  no json here  ")).toBe("no json here");
  });
});

describe("extractMenuFromImages", () => {
  it("parses a valid AI response into ExtractedMenuData", async () => {
    mockComplete.mockResolvedValue(
      JSON.stringify({
        categories: [{ name: "Mains", items: [{ name: "Burger", priceCents: 1200 }] }],
      }),
    );

    const result = await extractMenuFromImages([Buffer.from("fake-image")], "image/png");

    expect(result.categories[0]?.name).toBe("Mains");
    expect(result.categories[0]?.items[0]).toEqual({ name: "Burger", priceCents: 1200 });
  });

  it("rejects a malformed AI response that doesn't match the expected schema", async () => {
    mockComplete.mockResolvedValue(JSON.stringify({ notCategories: [] }));

    await expect(extractMenuFromImages([Buffer.from("fake-image")], "image/png")).rejects.toThrow();
  });

  it("rejects when the AI response contains no text content", async () => {
    mockComplete.mockResolvedValue("");

    await expect(extractMenuFromImages([Buffer.from("fake-image")], "image/png")).rejects.toThrow();
  });

  it("parses a fenced ```json response (the common real-world model behavior)", async () => {
    mockComplete.mockResolvedValue("```json\n" + MENU_JSON + "\n```");

    const result = await extractMenuFromImages([Buffer.from("fake-image")], "image/png");

    expect(result.categories[0]?.items[0]).toEqual({ name: "Burger", priceCents: 1200 });
  });

  it("parses a response with surrounding preamble prose", async () => {
    mockComplete.mockResolvedValue("Sure! Here is the menu:\n" + MENU_JSON);

    const result = await extractMenuFromImages([Buffer.from("fake-image")], "image/png");

    expect(result.categories[0]?.name).toBe("Mains");
  });

  it("throws a clear error (not a raw SyntaxError) when the response isn't JSON", async () => {
    mockComplete.mockResolvedValue("I could not read the menu image.");

    await expect(extractMenuFromImages([Buffer.from("fake-image")], "image/png")).rejects.toThrow(
      "AI response was not valid JSON",
    );
  });
});

describe("extractMenuFromText", () => {
  it("parses a valid AI response, including a businessProfile, into ExtractedMenuData", async () => {
    mockComplete.mockResolvedValue(
      JSON.stringify({
        categories: [{ name: "Mains", items: [{ name: "Burger", priceCents: 1200 }] }],
        businessProfile: { name: "Joe's Diner", phone: "555-0100" },
      }),
    );

    const result = await extractMenuFromText("Welcome to Joe's Diner. Menu: Burger $12.00. Call 555-0100.");

    expect(result.categories[0]?.name).toBe("Mains");
    expect(result.businessProfile).toEqual({ name: "Joe's Diner", phone: "555-0100" });
  });

  it("rejects a malformed AI response that doesn't match the expected schema", async () => {
    mockComplete.mockResolvedValue(JSON.stringify({ notCategories: [] }));

    await expect(extractMenuFromText("some page text")).rejects.toThrow();
  });
});
