import { Role } from "@prisma/client";
import { Router } from "express";
import { publicCommerceRateLimiter, staffActionRateLimiter, webhookRateLimiter } from "../../../middleware/rate-limit";
import { requireAuth } from "../../../middleware/require-auth";
import { requireRole } from "../../../middleware/require-role";
import {
  connectProviderHandler,
  disconnectProviderHandler,
  listMethodsHandler,
  listProvidersHandler,
  updateMethodHandler,
  updateProviderPriorityHandler,
} from "./payments.controller";
import { getPublicPaymentConfigHandler } from "./public-payment-config.controller";
import { paymentWebhookHandler } from "./webhook.controller";

// Owner/staff-facing config routes — mounted at "/api/restaurants" myself,
// so internal paths resolve to e.g. "/api/restaurants/me/payment-providers".
export const paymentsRouter = Router();

const staffOrOwner = requireRole(Role.RESTAURANT_OWNER, Role.RESTAURANT_STAFF);

paymentsRouter.get("/me/payment-providers", requireAuth, staffOrOwner, staffActionRateLimiter, listProvidersHandler);
paymentsRouter.post("/me/payment-providers/:type/connect", requireAuth, staffOrOwner, staffActionRateLimiter, connectProviderHandler);
paymentsRouter.delete("/me/payment-providers/:type", requireAuth, staffOrOwner, staffActionRateLimiter, disconnectProviderHandler);
paymentsRouter.patch(
  "/me/payment-providers/:type/priority",
  requireAuth,
  staffOrOwner,
  staffActionRateLimiter,
  updateProviderPriorityHandler,
);

paymentsRouter.get("/me/payment-methods", requireAuth, staffOrOwner, staffActionRateLimiter, listMethodsHandler);
paymentsRouter.patch("/me/payment-methods/:methodType", requireAuth, staffOrOwner, staffActionRateLimiter, updateMethodHandler);

// Public webhook router — no requireAuth, signature-verified instead.
export const paymentWebhookRouter = Router();
paymentWebhookRouter.post("/:providerType", webhookRateLimiter, paymentWebhookHandler);

// Public, unauthenticated — the checkout page's own Stripe Elements
// bootstrap. Returns only providerType/publicKey, nothing else (Sprint 07.6
// C-1). Mounted at "/api/public" myself, alongside the other public
// commerce routers.
export const publicPaymentConfigRouter = Router();
publicPaymentConfigRouter.get(
  "/restaurants/:restaurantId/payment-config",
  publicCommerceRateLimiter,
  getPublicPaymentConfigHandler,
);
