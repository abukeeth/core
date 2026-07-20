import type { Request, Response } from "express";
import { createLogger } from "../../lib/logger";
import { completeIdempotencyKey, failIdempotencyKey, reserveIdempotencyKey } from "../../lib/idempotency";
import { REFRESH_TOKEN_COOKIE, clearAuthCookies, setAccessTokenCookie, setRefreshTokenCookie } from "./cookies";
import {
  AccountDeactivatedError,
  EmailInUseError,
  InvalidCredentialsError,
  InvalidEmailVerificationTokenError,
  InvalidPasswordResetTokenError,
  InvalidRefreshTokenError,
  OwnerWithoutBusinessError,
  StaffNotFoundError,
} from "./auth.errors";
import {
  changePassword,
  createStaff,
  dispatchSignupVerificationEmail,
  getUserById,
  issueTokenPair,
  listStaff,
  reassignStaffRole,
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
  reassignStaffRoleSchema,
  registerSchema,
  requestPasswordResetSchema,
  setStaffActiveSchema,
  updateProfileSchema,
  verifyEmailSchema,
} from "./auth.validation";

const logger = createLogger("auth-controller");
const AUTH_DELIVERY_WAIT_BUDGET_MS = 3_000;

interface AuthErrorBody {
  error: string;
  code: string;
}

interface IdempotentSnapshot {
  statusCode: number;
  body: unknown;
}

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

function getRequestId(req: Request, res: Response): string {
  const responseRequestId = res.getHeader("X-Request-Id");
  if (typeof responseRequestId === "string" && responseRequestId.length > 0) {
    return responseRequestId;
  }
  const requestId = req.header("X-Request-Id");
  return requestId && requestId.length > 0 ? requestId : "unknown";
}

function logAuthOutcome(
  req: Request,
  res: Response,
  authFlow: "signup" | "login" | "password_reset_request" | "resend_verification",
  startedAt: number,
  statusCode: number,
  outcome: string,
  extra: Record<string, unknown> = {},
): void {
  logger.info(
    {
      authFlow,
      outcome,
      statusCode,
      durationMs: Date.now() - startedAt,
      requestId: getRequestId(req, res),
      ...extra,
    },
    "Auth flow completed",
  );
}

async function reserveAuthIdempotency(
  req: Request,
  endpoint: "auth.register" | "auth.login" | "auth.forgotPassword" | "auth.resendVerification",
): Promise<{ key: string | null; replayed: boolean; inProgress: boolean; snapshot?: IdempotentSnapshot }> {
  const key = req.header("Idempotency-Key");
  if (!key) {
    return { key: null, replayed: false, inProgress: false };
  }
  const reservation = await reserveIdempotencyKey<IdempotentSnapshot>(key, endpoint);
  if (reservation.status === "completed") {
    return { key, replayed: true, inProgress: false, snapshot: reservation.response };
  }
  if (reservation.status === "in_progress") {
    return { key, replayed: false, inProgress: true };
  }
  return { key, replayed: false, inProgress: false };
}

async function completeAuthIdempotency(key: string | null, statusCode: number, body: unknown): Promise<void> {
  if (!key) return;
  await completeIdempotencyKey(key, { statusCode, body } satisfies IdempotentSnapshot);
}

async function failAuthIdempotency(key: string | null): Promise<void> {
  if (!key) return;
  await failIdempotencyKey(key);
}

function sendIdempotentReplay(res: Response, snapshot: IdempotentSnapshot | undefined): void {
  if (!snapshot || typeof snapshot.statusCode !== "number") {
    res.status(200).json({ ok: true });
    return;
  }
  res.status(snapshot.statusCode).json(snapshot.body);
}

function inProgressBody(action: string): AuthErrorBody {
  return {
    error: `${action} is still being processed. Retry with the same request in a moment.`,
    code: "AUTH_REQUEST_IN_PROGRESS",
  };
}

async function waitForResultWithin<T>(promise: Promise<T>, timeoutMs: number): Promise<{ settled: true; value: T } | { settled: false }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<{ settled: false }>((resolve) => {
    timer = setTimeout(() => resolve({ settled: false }), timeoutMs);
  });
  const winner = await Promise.race([
    promise.then((value) => ({ settled: true as const, value })),
    timeoutPromise,
  ]);
  if (timer) {
    clearTimeout(timer);
  }
  return winner;
}

export async function register(req: Request, res: Response): Promise<void> {
  const startedAt = Date.now();
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    const body = { error: "Invalid input", details: parsed.error.issues, code: "AUTH_INVALID_INPUT" };
    res.status(400).json(body);
    logAuthOutcome(req, res, "signup", startedAt, 400, "invalid_input");
    return;
  }

  const idempotency = await reserveAuthIdempotency(req, "auth.register");
  if (idempotency.replayed) {
    sendIdempotentReplay(res, idempotency.snapshot);
    logAuthOutcome(req, res, "signup", startedAt, idempotency.snapshot?.statusCode ?? 200, "idempotent_replay");
    return;
  }
  if (idempotency.inProgress) {
    const body = inProgressBody("Signup");
    res.status(202).json(body);
    logAuthOutcome(req, res, "signup", startedAt, 202, "in_progress");
    return;
  }

  try {
    const user = await registerOwner(parsed.data);
    const signupState = "ACCOUNT_CREATED" as const;
    const statusCode = 201;
    await issueAndSetCookies(res, user);
    dispatchSignupVerificationEmail(user.id);

    const body = {
      user: toPublicUser(user),
      signupState,
      verificationEmail: {
        state: "PENDING",
        message: "Account created. Verification email delivery is still processing.",
      },
    };
    await completeAuthIdempotency(idempotency.key, statusCode, body);
    res.status(statusCode).json(body);
    logAuthOutcome(req, res, "signup", startedAt, statusCode, signupState);
  } catch (err) {
    if (err instanceof EmailInUseError) {
      try {
        const recovered = await validateCredentials({ email: parsed.data.email, password: parsed.data.password });
        await issueAndSetCookies(res, recovered);
        const body = {
          user: toPublicUser(recovered),
          signupState: "ACCOUNT_RECOVERED",
          verificationEmail: {
            state: "PENDING",
            message: "Account already existed and has been recovered. Verification email can be resent from the dashboard.",
          },
        };
        await completeAuthIdempotency(idempotency.key, 200, body);
        res.status(200).json(body);
        logAuthOutcome(req, res, "signup", startedAt, 200, "recovered_existing_account");
        return;
      } catch {
        await failAuthIdempotency(idempotency.key);
        const body = { error: err.message, code: "SIGNUP_EMAIL_IN_USE" };
        res.status(409).json(body);
        logAuthOutcome(req, res, "signup", startedAt, 409, "email_in_use");
        return;
      }
    }
    await failAuthIdempotency(idempotency.key);
    throw err;
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  const startedAt = Date.now();
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    const body = { error: "Invalid input", details: parsed.error.issues, code: "AUTH_INVALID_INPUT" };
    res.status(400).json(body);
    logAuthOutcome(req, res, "login", startedAt, 400, "invalid_input");
    return;
  }

  const idempotency = await reserveAuthIdempotency(req, "auth.login");
  if (idempotency.replayed) {
    sendIdempotentReplay(res, idempotency.snapshot);
    logAuthOutcome(req, res, "login", startedAt, idempotency.snapshot?.statusCode ?? 200, "idempotent_replay");
    return;
  }
  if (idempotency.inProgress) {
    const body = inProgressBody("Login");
    res.status(202).json(body);
    logAuthOutcome(req, res, "login", startedAt, 202, "in_progress");
    return;
  }

  try {
    const user = await validateCredentials(parsed.data);
    await issueAndSetCookies(res, user, parsed.data.rememberMe ?? true);
    const body = { user: toPublicUser(user), loginState: "AUTHENTICATED" as const };
    await completeAuthIdempotency(idempotency.key, 200, body);
    res.status(200).json(body);
    logAuthOutcome(req, res, "login", startedAt, 200, "authenticated");
  } catch (err) {
    if (err instanceof InvalidCredentialsError) {
      await failAuthIdempotency(idempotency.key);
      const body = { error: err.message, code: "AUTHENTICATION_FAILED" };
      res.status(401).json(body);
      logAuthOutcome(req, res, "login", startedAt, 401, "invalid_credentials");
      return;
    }
    if (err instanceof AccountDeactivatedError) {
      await failAuthIdempotency(idempotency.key);
      const body = { error: err.message, code: "ACCOUNT_DEACTIVATED" };
      res.status(403).json(body);
      logAuthOutcome(req, res, "login", startedAt, 403, "account_deactivated");
      return;
    }
    await failAuthIdempotency(idempotency.key);
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
    if (err instanceof OwnerWithoutBusinessError) {
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

export async function reassignStaffRoleHandler(req: Request, res: Response): Promise<void> {
  const parsed = reassignStaffRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const staff = await reassignStaffRole(req.user!.id, req.params.id as string, parsed.data.membershipRole);
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
  const startedAt = Date.now();
  const parsed = requestPasswordResetSchema.safeParse(req.body);
  if (!parsed.success) {
    const body = { error: "Invalid input", details: parsed.error.issues, code: "AUTH_INVALID_INPUT" };
    res.status(400).json(body);
    logAuthOutcome(req, res, "password_reset_request", startedAt, 400, "invalid_input");
    return;
  }

  const idempotency = await reserveAuthIdempotency(req, "auth.forgotPassword");
  if (idempotency.replayed) {
    sendIdempotentReplay(res, idempotency.snapshot);
    logAuthOutcome(req, res, "password_reset_request", startedAt, idempotency.snapshot?.statusCode ?? 200, "idempotent_replay");
    return;
  }
  if (idempotency.inProgress) {
    const body = inProgressBody("Password reset request");
    res.status(202).json(body);
    logAuthOutcome(req, res, "password_reset_request", startedAt, 202, "in_progress");
    return;
  }

  try {
    const resetPromise = requestPasswordReset(parsed.data.email);
    const settled = await waitForResultWithin(resetPromise, AUTH_DELIVERY_WAIT_BUDGET_MS);
    if (!settled.settled) {
      const body = {
        ok: true,
        state: "REQUEST_ACCEPTED",
        delivery: "PENDING",
        message: "Password reset request accepted. If an account exists, you will receive an email shortly.",
      };
      void resetPromise
        .then(async (finalResult) => {
          const replayBody = {
            ok: true,
            state: "REQUEST_ACCEPTED",
            delivery: "PENDING",
            message: "Password reset request accepted. If an account exists, you will receive an email shortly.",
          };
          await completeAuthIdempotency(idempotency.key, 200, replayBody);
          logger.info(
            {
              authFlow: "password_reset_request",
              requestId: getRequestId(req, res),
              accountFound: finalResult.accountFound,
              deliverySent: finalResult.sent,
            },
            "Password reset email delivery finished after accepted response",
          );
        })
        .catch(async (err) => {
          await failAuthIdempotency(idempotency.key);
          logger.error({ authFlow: "password_reset_request", requestId: getRequestId(req, res), err }, "Password reset request failed asynchronously");
        });
      res.status(202).json(body);
      logAuthOutcome(req, res, "password_reset_request", startedAt, 202, "accepted_pending_delivery");
      return;
    }

    const resetResult = settled.value;
    const body = {
      ok: true,
      state: "REQUEST_ACCEPTED",
      delivery: "PENDING",
      message: "Password reset request accepted. If an account exists, you will receive an email shortly.",
    };
    await completeAuthIdempotency(idempotency.key, 200, body);
    res.status(200).json(body);
    logAuthOutcome(req, res, "password_reset_request", startedAt, 200, "request_accepted", {
      accountFound: resetResult.accountFound,
      deliverySent: resetResult.sent,
    });
  } catch (err) {
    await failAuthIdempotency(idempotency.key);
    throw err;
  }
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
  const startedAt = Date.now();
  const idempotency = await reserveAuthIdempotency(req, "auth.resendVerification");
  if (idempotency.replayed) {
    sendIdempotentReplay(res, idempotency.snapshot);
    logAuthOutcome(req, res, "resend_verification", startedAt, idempotency.snapshot?.statusCode ?? 200, "idempotent_replay");
    return;
  }
  if (idempotency.inProgress) {
    const body = inProgressBody("Verification resend");
    res.status(202).json(body);
    logAuthOutcome(req, res, "resend_verification", startedAt, 202, "in_progress");
    return;
  }

  try {
    const sendPromise = sendEmailVerification(req.user!.id, { enforceResendCooldown: true });
    const outcome = await waitForResultWithin(sendPromise, AUTH_DELIVERY_WAIT_BUDGET_MS);
    if (!outcome.settled) {
      void sendPromise
        .then(async (finalResult) => {
          const deliveredState = finalResult.state === "THROTTLED" ? "ACCEPTED" : "SENT";
          const statusCode = deliveredState === "SENT" ? 200 : 202;
          const replayBody = {
            ok: true,
            state: deliveredState,
            code: deliveredState === "SENT" ? "EMAIL_SENT" : "EMAIL_RESEND_THROTTLED",
            message:
              deliveredState === "SENT"
                ? "Verification email sent — check your inbox."
                : "A verification email was requested recently. Please wait before requesting another.",
          };
          if (!finalResult.sent) {
            await completeAuthIdempotency(idempotency.key, 503, {
              error: "We couldn't deliver the verification email right now. Please retry in a minute.",
              code: "EMAIL_DELIVERY_FAILED",
              state: "FAILED",
            });
            return;
          }
          await completeAuthIdempotency(idempotency.key, statusCode, replayBody);
        })
        .catch(async (err) => {
          await failAuthIdempotency(idempotency.key);
          logger.error({ authFlow: "resend_verification", requestId: getRequestId(req, res), err }, "Resend verification async completion failed");
        });
      const body = {
        ok: true,
        state: "ACCEPTED",
        code: "EMAIL_DELIVERY_PENDING",
        message: "Verification email request accepted and still processing. Check again in a moment.",
      };
      res.status(202).json(body);
      logAuthOutcome(req, res, "resend_verification", startedAt, 202, "delivery_pending");
      return;
    }

    if (!outcome.value.sent) {
      const body = {
        error: "We couldn't deliver the verification email right now. Please retry in a minute.",
        code: "EMAIL_DELIVERY_FAILED",
        state: "FAILED",
      };
      await completeAuthIdempotency(idempotency.key, 503, body);
      res.status(503).json(body);
      logAuthOutcome(req, res, "resend_verification", startedAt, 503, "delivery_failed", {
        deliveryState: outcome.value.state,
      });
      return;
    }

    const deliveredState = outcome.value.state === "THROTTLED" ? "ACCEPTED" : "SENT";
    const statusCode = deliveredState === "SENT" ? 200 : 202;
    const body = {
      ok: true,
      state: deliveredState,
      code: deliveredState === "SENT" ? "EMAIL_SENT" : "EMAIL_RESEND_THROTTLED",
      message:
        deliveredState === "SENT"
          ? "Verification email sent — check your inbox."
          : "A verification email was requested recently. Please wait before requesting another.",
    };
    await completeAuthIdempotency(idempotency.key, statusCode, body);
    res.status(statusCode).json(body);
    logAuthOutcome(req, res, "resend_verification", startedAt, statusCode, deliveredState.toLowerCase(), {
      deliveryState: outcome.value.state,
    });
  } catch (err) {
    await failAuthIdempotency(idempotency.key);
    throw err;
  }
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
