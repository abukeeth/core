import type { Request, Response } from "express";
import { getOwnRestaurantId } from "../../restaurants/restaurant.service";
import { commerceEventBus } from "../events/event-bus";

// Comment ping keeps the connection (and any intermediary idle timeout) alive
// when no orders are moving. Well under typical 30–60s proxy read timeouts.
const HEARTBEAT_MS = 25_000;

/**
 * Server-Sent Events stream of order activity for the authenticated staff/owner's
 * restaurant — the real-time transport behind the Kitchen Display. Each emitted
 * commerce event scoped to this restaurant is pushed as a lightweight `order`
 * event carrying just `{ type, orderId }`; the client refetches its queue on
 * receipt (keeping tenant redaction and the owner-order shape in one place, and
 * making a missed/reconnected event self-healing rather than a lost update).
 *
 * The bus is process-local (single-instance, at-most-once) — the KDS keeps a
 * slow poll as a safety net, so this stream only has to make the common case
 * instant, not be the sole source of truth.
 */
export async function kitchenStreamHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await getOwnRestaurantId(req.user!.id);
  if (!restaurantId) {
    res.status(404).json({ error: "No restaurant found for this account" });
    return;
  }

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // Defeat proxy response buffering (nginx and some platform proxies) so
  // events flush the instant they're written rather than in a batch.
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  // Initial comment opens the stream and flushes any read-ahead buffer so the
  // client's onopen fires promptly.
  res.write(": connected\n\n");

  const unsubscribe = commerceEventBus.subscribe("*", (event) => {
    if (event.restaurantId !== restaurantId) return;
    if (res.writableEnded) return;
    res.write(`event: order\ndata: ${JSON.stringify({ type: event.type, orderId: event.orderId })}\n\n`);
  });

  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(": ping\n\n");
  }, HEARTBEAT_MS);

  const cleanup = () => {
    clearInterval(heartbeat);
    unsubscribe();
  };
  req.on("close", cleanup);
}
