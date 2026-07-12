import type { ExtractedMenuData } from "../../types";

export type SpreadsheetRow = Record<string, string | number | undefined>;

// Header names are matched case-insensitively against these alias lists.
// Entries here cover plain "I made my own CSV" exports as well as the
// column names commonly seen in Square, Toast, and Clover menu/item
// exports — one shared list per concept rather than a per-POS adapter,
// so recognizing a new POS's header conventions is a one-line addition
// here, not a new adapter file.
const CATEGORY_ALIASES = ["category", "categories", "menu category", "item category", "menu group", "group", "section"];
const NAME_ALIASES = ["name", "item name", "menu item", "item", "product name", "title"];
const DESCRIPTION_ALIASES = ["description", "desc", "item description", "notes"];
const PRICE_ALIASES = ["price", "item price", "unit price", "cost", "price ($)"];

const DEFAULT_CATEGORY_NAME = "Uncategorized";

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase();
}

function findColumn(headers: string[], aliases: string[]): string | undefined {
  const normalized = headers.map((header) => ({ header, normalized: normalizeHeader(header) }));
  for (const alias of aliases) {
    const exact = normalized.find((entry) => entry.normalized === alias);
    if (exact) return exact.header;
  }
  for (const alias of aliases) {
    const partial = normalized.find((entry) => entry.normalized.includes(alias));
    if (partial) return partial.header;
  }
  return undefined;
}

/**
 * Returns priceCents and whether the source value parsed cleanly. A
 * missing/unparseable price still produces a row (defaulted to 0 cents)
 * rather than dropping the item — it's flagged with a low confidence
 * instead, so the human reviewer sees it rather than silently losing it.
 */
function parsePriceCents(raw: string | number | undefined): { priceCents: number; parsedCleanly: boolean } {
  if (raw === undefined || raw === null || raw === "") {
    return { priceCents: 0, parsedCleanly: false };
  }
  const numeric = typeof raw === "number" ? raw : Number.parseFloat(String(raw).replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(numeric)) {
    return { priceCents: 0, parsedCleanly: false };
  }
  return { priceCents: Math.round(numeric * 100), parsedCleanly: true };
}

/**
 * Turns generic spreadsheet rows (from a plain CSV export or a Square/
 * Toast/Clover menu export) into ExtractedMenuData, grouping rows by
 * their category column value (defaulting to "Uncategorized" when no
 * category column is found or a row's value is blank). Rows with no
 * usable item name are skipped — there's nothing to import from them.
 */
export function mapRowsToMenu(rows: SpreadsheetRow[]): ExtractedMenuData {
  if (rows.length === 0) {
    return { categories: [] };
  }

  const headers = Object.keys(rows[0]!);
  const categoryColumn = findColumn(headers, CATEGORY_ALIASES);
  const nameColumn = findColumn(headers, NAME_ALIASES);
  const descriptionColumn = findColumn(headers, DESCRIPTION_ALIASES);
  const priceColumn = findColumn(headers, PRICE_ALIASES);

  const itemsByCategory = new Map<string, ExtractedMenuData["categories"][number]["items"]>();

  for (const row of rows) {
    const name = nameColumn ? String(row[nameColumn] ?? "").trim() : "";
    if (!name) continue;

    const categoryName = (categoryColumn ? String(row[categoryColumn] ?? "").trim() : "") || DEFAULT_CATEGORY_NAME;
    const description = descriptionColumn ? String(row[descriptionColumn] ?? "").trim() || undefined : undefined;
    const { priceCents, parsedCleanly } = parsePriceCents(priceColumn ? row[priceColumn] : undefined);

    const items = itemsByCategory.get(categoryName) ?? [];
    items.push({ name, description, priceCents, confidence: parsedCleanly ? 1 : 0.4 });
    itemsByCategory.set(categoryName, items);
  }

  const categories = [...itemsByCategory.entries()].map(([name, items]) => ({ name, items }));
  return { categories };
}
