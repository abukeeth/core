import type { POSProviderType } from "@prisma/client";

export interface PosMenuItem {
  externalId: string;
  categoryName: string;
  name: string;
  description?: string;
  priceCents: number;
  isAvailable: boolean;
}

export interface ImportMenuResult {
  success: boolean;
  items: PosMenuItem[];
  errorMessage?: string;
}

export interface ExportOrderInput {
  orderId: string;
  orderNumber: number;
  items: { name: string; quantity: number; unitPriceCents: number; modifiers: string[] }[];
  totalCents: number;
}

export interface ExportOrderResult {
  success: boolean;
  externalOrderId?: string;
  errorMessage?: string;
}

export interface PosSyncStatusResult {
  connected: boolean;
  lastSyncedAt?: Date;
}

/**
 * The single extensibility seam for POS providers, mirroring
 * PaymentProviderAdapter/FulfillmentProviderAdapter. All Sprint 07
 * providers are registered stubs (`implemented: false`) — POS
 * integrations vary enormously in API maturity and typically require
 * per-provider partnership/certification, appropriately deferred rather
 * than rushed. The interface and registry are proven now so a real
 * integration is addable later without touching orchestration code.
 */
export interface POSProviderAdapter {
  readonly providerType: POSProviderType;
  readonly implemented: boolean;

  importMenu(credentials: string): Promise<ImportMenuResult>;
  exportOrder(input: ExportOrderInput, credentials: string): Promise<ExportOrderResult>;
  getSyncStatus(credentials: string): Promise<PosSyncStatusResult>;
}
