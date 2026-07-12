import type { Request, Response } from "express";
import {
  CUSTOMER_REFRESH_TOKEN_COOKIE,
  clearCustomerAuthCookies,
  setCustomerAccessTokenCookie,
  setCustomerRefreshTokenCookie,
} from "./customer-cookies";
import {
  CustomerEmailInUseError,
  InvalidCustomerCredentialsError,
  InvalidCustomerRefreshTokenError,
  InvalidPasswordResetTokenError,
} from "./customers.errors";
import {
  changePassword,
  getCustomerById,
  issueCustomerTokenPair,
  registerCustomer,
  requestPasswordReset,
  resetPassword,
  revokeCustomerRefreshToken,
  rotateCustomerRefreshToken,
  toPublicCustomer,
  validateCustomerCredentials,
} from "./customers.service";
import { changePasswordSchema, confirmPasswordResetSchema, loginCustomerSchema, registerCustomerSchema, requestPasswordResetSchema } from "./customers.validation";

async function issueAndSetCookies(res: Response, customerId: string): Promise<void> {
  const tokens = await issueCustomerTokenPair(customerId);
  setCustomerAccessTokenCookie(res, tokens.accessToken);
  setCustomerRefreshTokenCookie(res, tokens.refreshToken);
}

export async function registerHandler(req: Request, res: Response): Promise<void> {
  const parsed = registerCustomerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const customer = await registerCustomer(parsed.data);
    await issueAndSetCookies(res, customer.id);
    res.status(201).json({ customer: toPublicCustomer(customer) });
  } catch (err) {
    if (err instanceof CustomerEmailInUseError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const parsed = loginCustomerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const customer = await validateCustomerCredentials(parsed.data);
    await issueAndSetCookies(res, customer.id);
    res.status(200).json({ customer: toPublicCustomer(customer) });
  } catch (err) {
    if (err instanceof InvalidCustomerCredentialsError) {
      res.status(401).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function refreshHandler(req: Request, res: Response): Promise<void> {
  const presented = req.cookies?.[CUSTOMER_REFRESH_TOKEN_COOKIE];
  if (!presented) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    // Rotates the presented token (marks it revoked, issues a brand-new
    // pair) — a second use of the same now-revoked token is rejected and,
    // per rotateCustomerRefreshToken, invalidates every session for this
    // customer (Sprint 07.7 H-7 replay protection).
    const { tokens } = await rotateCustomerRefreshToken(presented);
    setCustomerAccessTokenCookie(res, tokens.accessToken);
    setCustomerRefreshTokenCookie(res, tokens.refreshToken);
    res.status(200).json({ ok: true });
  } catch {
    clearCustomerAuthCookies(res);
    res.status(401).json({ error: new InvalidCustomerRefreshTokenError().message });
  }
}

export async function logoutHandler(req: Request, res: Response): Promise<void> {
  const presented = req.cookies?.[CUSTOMER_REFRESH_TOKEN_COOKIE];
  if (presented) {
    // Logout now actually revokes the presented refresh token server-side
    // (Sprint 07.7 H-7), rather than only clearing cookies — a stolen
    // refresh token can no longer be replayed after the customer logs out.
    await revokeCustomerRefreshToken(presented);
  }
  clearCustomerAuthCookies(res);
  res.status(200).json({ ok: true });
}

export async function meHandler(req: Request, res: Response): Promise<void> {
  const customer = await getCustomerById(req.customer!.id);
  if (!customer) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.status(200).json({ customer: toPublicCustomer(customer) });
}

/** Always 200 regardless of whether the email matches an account — enumeration prevention (Sprint 07.7 H-6). */
export async function requestPasswordResetHandler(req: Request, res: Response): Promise<void> {
  const parsed = requestPasswordResetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  await requestPasswordReset(parsed.data.email);
  res.status(200).json({ ok: true });
}

export async function confirmPasswordResetHandler(req: Request, res: Response): Promise<void> {
  const parsed = confirmPasswordResetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    await resetPassword(parsed.data.token, parsed.data.newPassword);
    res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof InvalidPasswordResetTokenError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function changePasswordHandler(req: Request, res: Response): Promise<void> {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    await changePassword(req.customer!.id, parsed.data.currentPassword, parsed.data.newPassword);
    res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof InvalidCustomerCredentialsError) {
      res.status(401).json({ error: err.message });
      return;
    }
    throw err;
  }
}
