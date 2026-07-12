import type { NextFunction, Request, Response } from "express";
import { CUSTOMER_ACCESS_TOKEN_COOKIE } from "./customer-cookies";
import { verifyCustomerAccessToken } from "./customer-jwt";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      customer?: { id: string };
    }
  }
}

export function requireCustomerAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[CUSTOMER_ACCESS_TOKEN_COOKIE];
  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const customerId = verifyCustomerAccessToken(token);
    req.customer = { id: customerId };
    next();
  } catch {
    res.status(401).json({ error: "Not authenticated" });
  }
}
