import { Router } from "express";
import { requireAuth } from "../../middleware/require-auth";
import { billingWebhookHandler, createCheckoutHandler, createPortalHandler, getSummaryHandler } from "./billing.controller";

export const billingRouter = Router();
billingRouter.get("/me", requireAuth, getSummaryHandler);
billingRouter.post("/checkout", requireAuth, createCheckoutHandler);
billingRouter.post("/portal", requireAuth, createPortalHandler);

/** Mounted at /api/webhooks/billing — no requireAuth, Stripe-signature-verified instead. */
export const billingWebhookRouter = Router();
billingWebhookRouter.post("/", billingWebhookHandler);
