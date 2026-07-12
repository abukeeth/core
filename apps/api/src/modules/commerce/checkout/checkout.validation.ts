import { z } from "zod";

export const quoteRequestSchema = z.object({
  tipCents: z.number().int().nonnegative().default(0),
});

export const placeOrderSchema = z.object({
  tipCents: z.number().int().nonnegative().default(0),
  methodType: z.enum([
    "APPLE_PAY",
    "GOOGLE_PAY",
    "VISA",
    "MASTERCARD",
    "AMEX",
    "DISCOVER",
    "CASH_ON_DELIVERY",
    "CASH_AT_PICKUP",
  ]),
  methodToken: z.string().optional(),
  guestEmail: z.email().optional(),
  guestName: z.string().min(1).max(128).optional(),
  guestPhone: z.string().max(32).optional(),
  deliveryInstructions: z.string().max(512).optional(),
  notes: z.string().max(512).optional(),
});

export type QuoteRequestInput = z.infer<typeof quoteRequestSchema>;
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;
