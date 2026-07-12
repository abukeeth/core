import type { Request, Response } from "express";
import { escapeHtml } from "./renderer/html-escape";
import { mapSiteError, paramId, requireOwnRestaurantId } from "./controller-helpers";
import { listNewsletterSubscribers, subscribeToNewsletter } from "./newsletter.service";
import { newsletterSubscribeSchema } from "./site.validation";

const THANK_YOU_PAGE = `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Subscribed</title></head>
<body><h1>Thanks — you're subscribed.</h1></body></html>`;

function wantsHtml(req: Request): boolean {
  return typeof req.headers.accept === "string" && req.headers.accept.includes("text/html");
}

/**
 * POST /public/sites/:id/newsletter — unauthenticated, rate-limited at the
 * route layer. Both renderer/components/newsletter.ts's dedicated section
 * and footer.ts's inline form submit as plain HTML forms (no client JS
 * required), so this branches on Accept exactly like contact.controller.ts's
 * submit does.
 */
export async function subscribe(req: Request, res: Response): Promise<void> {
  const parsed = newsletterSubscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    if (wantsHtml(req)) {
      res.status(400).set("Content-Type", "text/html; charset=utf-8").send(`<p>Invalid input: ${escapeHtml(JSON.stringify(parsed.error.issues))}</p>`);
      return;
    }
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const result = await subscribeToNewsletter(paramId(req), parsed.data);
    if (wantsHtml(req)) {
      res.status(202).set("Content-Type", "text/html; charset=utf-8").send(THANK_YOU_PAGE);
      return;
    }
    res.status(202).json(result);
  } catch (err) {
    if (!mapSiteError(err, res)) throw err;
  }
}

/** GET /api/sites/:id/newsletter-subscribers — the dashboard list. */
export async function list(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    const subscribers = await listNewsletterSubscribers(restaurantId, paramId(req));
    res.status(200).json({ subscribers });
  } catch (err) {
    if (!mapSiteError(err, res)) throw err;
  }
}
