import type { Request, Response } from "express";
import { escapeHtml } from "./renderer/html-escape";
import { mapSiteError, paramId, requireOwnRestaurantId } from "./controller-helpers";
import { listContactMessages, submitContactMessage } from "./contact.service";
import { contactMessageSchema } from "./site.validation";

const THANK_YOU_PAGE = `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Message sent</title></head>
<body><h1>Thanks — your message has been sent.</h1></body></html>`;

function wantsHtml(req: Request): boolean {
  return typeof req.headers.accept === "string" && req.headers.accept.includes("text/html");
}

/**
 * POST /public/sites/:id/contact — unauthenticated, rate-limited at the
 * route layer. The rendered ContactForm component (renderer/components/
 * contact.ts) submits as a plain HTML form (no client JS required), so a
 * browser navigating here expects an HTML response, not JSON — this
 * branches on Accept to serve either.
 */
export async function submit(req: Request, res: Response): Promise<void> {
  const parsed = contactMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    if (wantsHtml(req)) {
      res.status(400).set("Content-Type", "text/html; charset=utf-8").send(`<p>Invalid input: ${escapeHtml(JSON.stringify(parsed.error.issues))}</p>`);
      return;
    }
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const result = await submitContactMessage(paramId(req), req.ip ?? "unknown", parsed.data);
    if (wantsHtml(req)) {
      res.status(202).set("Content-Type", "text/html; charset=utf-8").send(THANK_YOU_PAGE);
      return;
    }
    res.status(202).json(result);
  } catch (err) {
    if (!mapSiteError(err, res)) throw err;
  }
}

/** GET /api/sites/:id/messages — the dashboard inbox. */
export async function list(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    const messages = await listContactMessages(restaurantId, paramId(req));
    res.status(200).json({ messages });
  } catch (err) {
    if (!mapSiteError(err, res)) throw err;
  }
}
