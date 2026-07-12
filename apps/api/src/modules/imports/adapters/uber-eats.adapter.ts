import { ImportSourceType } from "@prisma/client";
import { NotImplementedError } from "../import.errors";
import type { ExtractedMenuData, ImportAdapter, ImportSourceInput } from "../types";

/**
 * Stub — real implementation is deferred. Same Terms of Service caveat
 * as the DoorDash adapter applies here.
 */
export class UberEatsImportAdapter implements ImportAdapter {
  readonly sourceType = ImportSourceType.UBER_EATS;
  readonly implemented = false;
  readonly inputKind = "url" as const;

  async extract(_input: ImportSourceInput): Promise<ExtractedMenuData> {
    throw new NotImplementedError(this.sourceType);
  }
}
