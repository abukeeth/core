import { z } from "zod";

export const listOrdersQuerySchema = z.object({
  status: z.enum(["PENDING_PAYMENT", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED", "REFUNDED", "FAILED"]).optional(),
  source: z.enum(["WEBSITE", "QR_DINE_IN", "POS", "PHONE", "MARKETPLACE", "MOBILE_APP"]).optional(),
  limit: z.coerce.number().int().positive().max(100).default(25),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export const cancelOrderSchema = z.object({
  reason: z.string().max(512).optional(),
});

export const refundOrderSchema = z.object({
  amountCents: z.number().int().positive(),
  reason: z.enum(["CUSTOMER_REQUEST", "ORDER_CANCELLED", "ITEM_UNAVAILABLE", "QUALITY_ISSUE", "OTHER"]),
});

export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
export type RefundOrderInput = z.infer<typeof refundOrderSchema>;
