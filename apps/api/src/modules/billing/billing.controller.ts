import type { Request, Response } from "express";
import { NoRestaurantError } from "../restaurants/restaurant.errors";
import { BillingNotConfiguredError, BillingPortalUnavailableError } from "./billing.errors";
import { createCheckoutSession, createPortalSession, getBillingSummary, handleBillingWebhook } from "./billing.service";
import { createLogger } from "../../lib/logger";

const logger = createLogger("billing.controller");

function mapBillingError(err: unknown, res: Response): void {
  if (err instanceof NoRestaurantError) {
    res.status(404).json({ error: "No business found for this account" });
    return;
  }
  if (err instanceof BillingNotConfiguredError) {
    res.status(503).json({ error: "Billing is not available yet", code: "BILLING_NOT_CONFIGURED" });
    return;
  }
  if (err instanceof BillingPortalUnavailableError) {
    res.status(409).json({ error: err.message, code: "NO_BILLING_ACCOUNT" });
    return;
  }
  logger.error({ err }, "billing request failed");
  res.status(500).json({ error: "Billing request failed" });
}

export async function getSummaryHandler(req: Request, res: Response): Promise<void> {
  try {
    res.json({ billing: await getBillingSummary(req.user!.id) });
  } catch (err) {
    mapBillingError(err, res);
  }
}

export async function createCheckoutHandler(req: Request, res: Response): Promise<void> {
  try {
    res.json(await createCheckoutSession(req.user!.id));
  } catch (err) {
    mapBillingError(err, res);
  }
}

export async function createPortalHandler(req: Request, res: Response): Promise<void> {
  try {
    res.json(await createPortalSession(req.user!.id));
  } catch (err) {
    mapBillingError(err, res);
  }
}

/**
 * Public, unauthenticated — signature-verified against the platform
 * webhook secret instead. Raw bytes come from `req.rawBody`, populated
 * globally by app.ts's `express.json({ verify })`.
 */
export async function billingWebhookHandler(req: Request, res: Response): Promise<void> {
  const signatureHeader = req.header("stripe-signature") ?? "";
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody?.toString("utf8") ?? JSON.stringify(req.body);
  try {
    const outcome = await handleBillingWebhook(rawBody, signatureHeader);
    switch (outcome) {
      case "invalid_signature":
        res.status(400).json({ error: "Invalid webhook signature" });
        return;
      case "unmatched":
        // Acknowledge with 200 so Stripe doesn't retry forever an event for
        // a subscription this database has never heard of.
        logger.warn("billing webhook did not match any subscription");
        res.status(200).json({ received: true, matched: false });
        return;
      default:
        res.status(200).json({ received: true });
        return;
    }
  } catch (err) {
    if (err instanceof BillingNotConfiguredError) {
      res.status(503).json({ error: "Billing is not configured" });
      return;
    }
    logger.error({ err }, "billing webhook processing failed");
    // 500 → Stripe retries, which is what we want for transient DB failures.
    res.status(500).json({ error: "Webhook processing failed" });
  }
}
