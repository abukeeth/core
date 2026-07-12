import { POSProviderType } from "@prisma/client";
import { POSProviderNotImplementedError } from "../pos.errors";
import type { ExportOrderInput, ExportOrderResult, ImportMenuResult, POSProviderAdapter, PosSyncStatusResult } from "../types";

/** Stub — see square-pos.provider.ts for the shared rationale. */
export class LightspeedPOSProviderAdapter implements POSProviderAdapter {
  readonly providerType = POSProviderType.LIGHTSPEED;
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
