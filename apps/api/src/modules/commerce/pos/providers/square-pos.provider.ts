import { POSProviderType } from "@prisma/client";
import { POSProviderNotImplementedError } from "../pos.errors";
import type { ExportOrderInput, ExportOrderResult, ImportMenuResult, POSProviderAdapter, PosSyncStatusResult } from "../types";

/**
 * Stub — deliberate scope boundary per Sprint 07 spec §17. POS integrations
 * vary enormously in API maturity and typically require per-provider
 * partnership/certification; the interface/schema/registry are proven now
 * so a real integration is addable later without touching orchestration.
 */
export class SquarePOSProviderAdapter implements POSProviderAdapter {
  readonly providerType = POSProviderType.SQUARE_POS;
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
