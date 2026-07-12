import { PaymentProviderType } from "@prisma/client";
import { PaymentProviderNotImplementedError } from "../payments.errors";
import type {
  AuthorizeInput,
  AuthorizeResult,
  CaptureResult,
  NormalizedWebhookEvent,
  PaymentProviderAdapter,
  ProviderPaymentStatus,
  RefundResult,
  VoidResult,
} from "../types";

/**
 * Stub — registered per Sprint 07 spec §4, same treatment as
 * modules/imports/adapters/doordash.adapter.ts. `implemented: false` lets
 * the registry/owner dashboard show it as visible-but-unavailable without
 * hardcoding a provider-type list anywhere else.
 */
export class FiservPaymentProviderAdapter implements PaymentProviderAdapter {
  readonly providerType = PaymentProviderType.FISERV;
  readonly implemented = false;

  async authorize(_input: AuthorizeInput, _credentials: string): Promise<AuthorizeResult> {
    throw new PaymentProviderNotImplementedError(this.providerType);
  }

  async capture(
    _providerPaymentIntentId: string,
    _amountCents: number | undefined,
    _credentials: string,
  ): Promise<CaptureResult> {
    throw new PaymentProviderNotImplementedError(this.providerType);
  }

  async void(_providerPaymentIntentId: string, _credentials: string): Promise<VoidResult> {
    throw new PaymentProviderNotImplementedError(this.providerType);
  }

  async refund(_providerPaymentIntentId: string, _amountCents: number, _credentials: string): Promise<RefundResult> {
    throw new PaymentProviderNotImplementedError(this.providerType);
  }

  async getStatus(_providerPaymentIntentId: string, _credentials: string): Promise<ProviderPaymentStatus> {
    throw new PaymentProviderNotImplementedError(this.providerType);
  }

  verifyWebhookSignature(_rawBody: string, _signatureHeader: string, _webhookSecret: string): boolean {
    throw new PaymentProviderNotImplementedError(this.providerType);
  }

  parseWebhookEvent(_payload: unknown): NormalizedWebhookEvent {
    throw new PaymentProviderNotImplementedError(this.providerType);
  }
}
