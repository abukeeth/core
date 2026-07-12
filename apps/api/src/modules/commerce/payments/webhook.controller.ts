import type { Request, Response } from "express";
import { handlePaymentWebhook } from "./webhook.service";

/**
 * Public, unauthenticated (signature-verified instead) — BYOP means each
 * restaurant's webhook secret differs, so the specific PaymentProvider row
 * is identified via `?providerId=` (validated against the `:providerType`
 * path segment implicitly by webhook.service looking the row up directly).
 * Raw body bytes come from `req.rawBody`, populated globally by app.ts's
 * `express.json({ verify })` — see app.ts for that wiring.
 */
export async function paymentWebhookHandler(req: Request, res: Response): Promise<void> {
  const providerId = typeof req.query.providerId === "string" ? req.query.providerId : undefined;
  const signatureHeader = req.header("stripe-signature") ?? req.header("x-webhook-signature") ?? "";
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody?.toString("utf8") ?? JSON.stringify(req.body);

  if (!providerId) {
    res.status(400).json({ error: "Missing providerId query parameter" });
    return;
  }

  const outcome = await handlePaymentWebhook({
    providerId,
    rawBody,
    signatureHeader,
    parsedPayload: req.body,
  });

  switch (outcome.status) {
    case "processed":
    case "duplicate":
      res.status(200).json({ received: true });
      return;
    case "invalid_signature":
      res.status(400).json({ error: "Invalid webhook signature" });
      return;
    case "provider_not_found":
      res.status(404).json({ error: "Payment provider not found" });
      return;
  }
}
