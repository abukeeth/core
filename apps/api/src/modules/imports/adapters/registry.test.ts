import { ImportSourceType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { NotImplementedError } from "../import.errors";
import { importAdapterRegistry } from "./registry";

describe("importAdapterRegistry", () => {
  it("resolves an adapter for every source type", () => {
    for (const sourceType of Object.values(ImportSourceType)) {
      expect(importAdapterRegistry.get(sourceType)).toBeDefined();
    }
  });

  it("marks PDF, IMAGE, CSV, WEBSITE, and GOOGLE_MAPS as implemented", () => {
    expect(importAdapterRegistry.get(ImportSourceType.PDF)?.implemented).toBe(true);
    expect(importAdapterRegistry.get(ImportSourceType.IMAGE)?.implemented).toBe(true);
    expect(importAdapterRegistry.get(ImportSourceType.CSV)?.implemented).toBe(true);
    expect(importAdapterRegistry.get(ImportSourceType.WEBSITE)?.implemented).toBe(true);
    expect(importAdapterRegistry.get(ImportSourceType.GOOGLE_MAPS)?.implemented).toBe(true);
  });

  it("marks DoorDash, Uber Eats, and Grubhub as not implemented (Sprint 05 leaves these untouched)", () => {
    const deferred = [ImportSourceType.DOORDASH, ImportSourceType.UBER_EATS, ImportSourceType.GRUBHUB];

    for (const sourceType of deferred) {
      expect(importAdapterRegistry.get(sourceType)?.implemented).toBe(false);
    }
  });

  it("rejects with NotImplementedError when a stub adapter's extract() is called", async () => {
    const adapter = importAdapterRegistry.get(ImportSourceType.DOORDASH);
    await expect(adapter?.extract({ kind: "url", url: "https://example.com" })).rejects.toBeInstanceOf(
      NotImplementedError,
    );
  });

  it("reports the correct inputKind per source", () => {
    expect(importAdapterRegistry.get(ImportSourceType.PDF)?.inputKind).toBe("file");
    expect(importAdapterRegistry.get(ImportSourceType.IMAGE)?.inputKind).toBe("file");
    expect(importAdapterRegistry.get(ImportSourceType.CSV)?.inputKind).toBe("file");
    expect(importAdapterRegistry.get(ImportSourceType.WEBSITE)?.inputKind).toBe("url");
    expect(importAdapterRegistry.get(ImportSourceType.GOOGLE_MAPS)?.inputKind).toBe("url");
    expect(importAdapterRegistry.get(ImportSourceType.DOORDASH)?.inputKind).toBe("url");
  });
});
