import type { NextFunction, Request, Response } from "express";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      idempotencyKey?: string;
    }
  }
}

/**
 * Every mutating commerce endpoint that can plausibly be double-submitted
 * (place-order, refund, coupon-redeem) requires this header — checked
 * against IdempotencyKey in the service layer via reserveIdempotencyKey().
 */
export function requireIdempotencyKey(req: Request, res: Response, next: NextFunction): void {
  const key = req.header("Idempotency-Key");
  if (!key) {
    res.status(400).json({ error: "Idempotency-Key header is required" });
    return;
  }
  req.idempotencyKey = key;
  next();
}
