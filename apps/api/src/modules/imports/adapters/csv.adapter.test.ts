import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { CsvImportAdapter } from "./csv.adapter";

const adapter = new CsvImportAdapter();

describe("CsvImportAdapter", () => {
  it("reports its registry metadata", () => {
    expect(adapter.sourceType).toBe("CSV");
    expect(adapter.implemented).toBe(true);
    expect(adapter.inputKind).toBe("file");
  });

  it("rejects a non-file input", async () => {
    await expect(adapter.extract({ kind: "url", url: "https://example.com" })).rejects.toThrow(/file upload/);
  });

  it("parses a plain CSV buffer into categories/items", async () => {
    const csv = "Category,Name,Description,Price\nAppetizers,Spring Rolls,Crispy,5.99\nMains,Burger,,12.50\n";
    const result = await adapter.extract({ kind: "file", buffer: Buffer.from(csv), mimeType: "text/csv" });

    expect(result.categories.map((c) => c.name)).toEqual(["Appetizers", "Mains"]);
    expect(result.categories[0]!.items[0]).toEqual({
      name: "Spring Rolls",
      description: "Crispy",
      priceCents: 599,
      confidence: 1,
    });
  });

  it("parses a real XLSX workbook buffer (first sheet only)", async () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Item Name", "Category", "Price"],
      ["Latte", "Drinks", "4.50"],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Menu");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const result = await adapter.extract({ kind: "file", buffer, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

    expect(result.categories).toEqual([
      { name: "Drinks", items: [{ name: "Latte", description: undefined, priceCents: 450, confidence: 1 }] },
    ]);
  });

  it("returns an empty categories list for an empty CSV file", async () => {
    const result = await adapter.extract({ kind: "file", buffer: Buffer.from(""), mimeType: "text/csv" });

    expect(result.categories).toEqual([]);
  });
});
