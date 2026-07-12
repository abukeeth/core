import type { Request, Response } from "express";
import { REFRESH_TOKEN_COOKIE, clearAuthCookies, setAccessTokenCookie, setRefreshTokenCookie } from "./cookies";
import {
  AccountDeactivatedError,
  EmailInUseError,
  InvalidCredentialsError,
  InvalidEmailVerificationTokenError,
  InvalidPasswordResetTokenError,
  InvalidRefreshTokenError,
  StaffNotFoundError,
} from "./auth.errors";
import {
  changePassword,
  createStaff,
  getUserById,
  issueTokenPair,
  listStaff,
  registerOwner,
  requestPasswordReset,
  resetPassword,
  revokeAllRefreshTokensForUser,
  rotateRefreshToken,
  revokeRefreshToken,
  sendEmailVerification,
  setStaffActive,
  toPublicUser,
  updateProfile,
  validateCredentials,
  verifyEmail,
} from "./auth.service";
import {
  changePasswordSchema,
  confirmPasswordResetSchema,
  createStaffSchema,
  loginSchema,
  registerSchema,
  requestPasswordResetSchema,
  setStaffActiveSchema,
  updateProfileSchema,
  verifyEmailSchema,
} from "./auth.validation";

function issueAndSetCookies(res: Response, user: Parameters<typeof issueTokenPair>[0], rememberMe = true) {
  return issueTokenPair(user, rememberMe).then((tokens) => {
    // Persist the access cookie until the refresh token expires (when
    // rememberMe) so mobile Safari does not drop the session when the
    // browser is closed and reopened; otherwise leave it a session cookie
    // like the refresh cookie, consistent with the rememberMe choice.
    setAccessTokenCookie(res, tokens.accessToken, rememberMe ? tokens.refreshExpiresAt : undefined);
    setRefreshTokenCookie(res, tokens.refreshToken, tokens.refreshExpiresAt, rememberMe);
  });
}

export async function register(req: Request, res: Response): Promise<void> {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const user = await registerOwner(parsed.data);
    await issueAndSetCookies(res, user);
    await sendEmailVerification(user.id);
    res.status(201).json({ user: toPublicUser(user) });
  } catch (err) {
    if (err instanceof EmailInUseError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const user = await validateCredentials(parsed.data);
    await issueAndSetCookies(res, user, parsed.data.rememberMe ?? true);
    res.status(200).json({ user: toPublicUser(user) });
  } catch (err) {
    if (err instanceof InvalidCredentialsError) {
      res.status(401).json({ error: err.message });
      return;
    }
    if (err instanceof AccountDeactivatedError) {
      res.status(403).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const presentedToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
  if (!presentedToken) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const { tokens, rememberMe } = await rotateRefreshToken(presentedToken);
    setAccessTokenCookie(res, tokens.accessToken, rememberMe ? tokens.refreshExpiresAt : undefined);
    setRefreshTokenCookie(res, tokens.refreshToken, tokens.refreshExpiresAt, rememberMe);
    res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof InvalidRefreshTokenError || err instanceof AccountDeactivatedError) {
      clearAuthCookies(res);
      res.status(401).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  const presentedToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
  if (presentedToken) {
    await revokeRefreshToken(presentedToken);
  }
  clearAuthCookies(res);
  res.status(200).json({ ok: true });
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = await getUserById(req.user!.id);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.status(200).json({ user: toPublicUser(user) });
}

export async function inviteStaff(req: Request, res: Response): Promise<void> {
  const parsed = createStaffSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const staff = await createStaff(req.user!.id, parsed.data);
    res.status(201).json({ user: toPublicUser(staff) });
  } catch (err) {
    if (err instanceof EmailInUseError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function listStaffHandler(req: Request, res: Response): Promise<void> {
  const staff = await listStaff(req.user!.id);
  res.status(200).json({ staff });
}

export async function setStaffActiveHandler(req: Request, res: Response): Promise<void> {
  const parsed = setStaffActiveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const staff = await setStaffActive(req.user!.id, req.params.id as string, parsed.data.isActive);
    res.status(200).json({ staff });
  } catch (err) {
    if (err instanceof StaffNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const parsed = requestPasswordResetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }
  await requestPasswordReset(parsed.data.email);
  res.status(200).json({ ok: true });
}

export async function resetPasswordHandler(req: Request, res: Response): Promise<void> {
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
    await changePassword(req.user!.id, parsed.data);
    res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof InvalidCredentialsError) {
      res.status(401).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function verifyEmailHandler(req: Request, res: Response): Promise<void> {
  const parsed = verifyEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    await verifyEmail(parsed.data.token);
    res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof InvalidEmailVerificationTokenError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function resendVerificationHandler(req: Request, res: Response): Promise<void> {
  const result = await sendEmailVerification(req.user!.id);
  if (!result.sent) {
    res.status(502).json({ error: "Could not send the verification email. Please try again in a few minutes." });
    return;
  }
  res.status(200).json({ ok: true });
}

export async function updateProfileHandler(req: Request, res: Response): Promise<void> {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }
  const user = await updateProfile(req.user!.id, parsed.data);
  res.status(200).json({ user: toPublicUser(user) });
}

export async function logoutAllDevicesHandler(req: Request, res: Response): Promise<void> {
  await revokeAllRefreshTokensForUser(req.user!.id);
  clearAuthCookies(res);
  res.status(200).json({ ok: true });
}
