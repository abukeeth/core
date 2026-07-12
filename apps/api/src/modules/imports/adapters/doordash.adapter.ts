import { ImportSourceType } from "@prisma/client";
import { NotImplementedError } from "../import.errors";
import type { ExtractedMenuData, ImportAdapter, ImportSourceInput } from "../types";

/**
 * Stub — real implementation is deferred. Note: DoorDash has no public
 * partner API for this use case, so a future implementation would need
 * either an official partnership or scraping their consumer site, which
 * carries Terms of Service risk — a product/legal decision for whoever
 * builds this adapter, not resolved by this interface.
 */
export class DoorDashImportAdapter implements ImportAdapter {
  readonly sourceType = ImportSourceType.DOORDASH;
  readonly implemented = false;
  readonly inputKind = "url" as const;

  async extract(_input: ImportSourceInput): Promise<ExtractedMenuData> {
    throw new NotImplementedError(this.sourceType);
  }
}
