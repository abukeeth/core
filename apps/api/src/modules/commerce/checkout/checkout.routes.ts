import { Router } from "express";
import { checkoutRateLimiter } from "../../../middleware/rate-limit";
import { requireIdempotencyKey } from "../../../middleware/require-idempotency-key";
import { confirmPaymentHandler, getQuoteHandler, placeOrderHandler } from "./checkout.controller";

// Mounted at "/api/public" myself — public, unauthenticated (guest or
// customer identity resolved from cookies, matching cart.routes.ts).
export const checkoutRouter = Router();

checkoutRouter.post("/checkout/:cartId/quote", checkoutRateLimiter, getQuoteHandler);
checkoutRouter.post("/checkout/:cartId/place-order", checkoutRateLimiter, requireIdempotencyKey, placeOrderHandler);
checkoutRouter.post("/checkout/:cartId/confirm-payment", checkoutRateLimiter, confirmPaymentHandler);
