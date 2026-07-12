import { POSProviderType } from "@prisma/client";
import { POSProviderNotImplementedError } from "../pos.errors";
import type { ExportOrderInput, ExportOrderResult, ImportMenuResult, POSProviderAdapter, PosSyncStatusResult } from "../types";

/** Stub — a catch-all connection type for POS systems without a dedicated adapter yet. */
export class GenericPOSProviderAdapter implements POSProviderAdapter {
  readonly providerType = POSProviderType.GENERIC;
  readonly implemented = false;

  async importMenu(_credentials: string): Promise<ImportMenuResult> {
    throw new POSProviderNotImplementedError(this.providerType);
  }

  async exportOrder(_input: ExportOrderInput, _credentials: string): Promise<ExportOrderResult> {
    throw new POSProviderNotImplementedError(this.providerType);
  }

  async getSyncStatus(_credentials: string): Promise<PosSyncStatusResult> {
    throw new POSProviderNotImplementedError(this.providerType);
  }
}
