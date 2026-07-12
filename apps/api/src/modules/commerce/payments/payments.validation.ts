import { z } from "zod";

/**
 * Connecting a PaymentProvider (BYOP): the restaurant supplies its own
 * provider credentials (e.g. a Stripe secret key) — never a platform-wide
 * key. `credentials` is encrypted at rest via encryptSecret() before
 * storage, never persisted in plaintext.
 */
export const connectProviderSchema = z.object({
  credentials: z.string().min(1),
  webhookSecret: z.string().min(1).optional(),
  displayName: z.string().min(1).max(128).optional(),
  /** Stripe publishable key — safe to store/serve in plaintext, unlike `credentials`. Powers the checkout page's client-side tokenization (Sprint 07.6 C-1). */
  publicKey: z.string().min(1).optional(),
});

export type ConnectProviderInput = z.infer<typeof connectProviderSchema>;

/**
 * Reordering provider-level failover priority / setting the default
 * provider (Sprint 07 spec §21 — PATCH .../payment-providers/:type/priority).
 * Lower `priority` is tried first during orchestration failover.
 */
export const updateProviderPrioritySchema = z.object({
  priority: z.number().int().optional(),
  isDefault: z.boolean().optional(),
});

export type UpdateProviderPriorityInput = z.infer<typeof updateProviderPrioritySchema>;

/** Enabling/disabling a PaymentMethod, optionally repointing its primary provider. */
export const updatePaymentMethodSchema = z.object({
  isEnabled: z.boolean().optional(),
  providerId: z.uuid().optional(),
});

export type UpdatePaymentMethodInput = z.infer<typeof updatePaymentMethodSchema>;
