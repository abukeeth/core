import { ImportSourceType } from "@prisma/client";
import * as XLSX from "xlsx";
import type { ExtractedMenuData, ImportAdapter, ImportSourceInput } from "../types";
import { mapRowsToMenu, type SpreadsheetRow } from "./spreadsheet/column-mapper";

/**
 * Accepts a CSV or XLSX menu export — either a plain spreadsheet an owner
 * made themselves, or an export from a POS system (Square/Toast/Clover)
 * with no scraping, no AI call, and no third-party API involved at all:
 * it's the owner's own data, parsed deterministically.
 */
export class CsvImportAdapter implements ImportAdapter {
  readonly sourceType = ImportSourceType.CSV;
  readonly implemented = true;
  readonly inputKind = "file" as const;

  async extract(input: ImportSourceInput): Promise<ExtractedMenuData> {
    if (input.kind !== "file") {
      throw new Error("CSV import requires a file upload");
    }

    const workbook = XLSX.read(input.buffer, { type: "buffer" });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return { categories: [] };
    }

    const sheet = workbook.Sheets[firstSheetName]!;
    const rows = XLSX.utils.sheet_to_json<SpreadsheetRow>(sheet, { defval: "" });

    return mapRowsToMenu(rows);
  }
}
