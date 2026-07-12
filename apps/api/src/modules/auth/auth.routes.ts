import { Router } from "express";
import { authRateLimiter } from "../../middleware/rate-limit";
import { requireAuth } from "../../middleware/require-auth";
import { requireRole } from "../../middleware/require-role";
import { Role } from "@prisma/client";
import {
  changePasswordHandler,
  forgotPassword,
  inviteStaff,
  listStaffHandler,
  login,
  logout,
  logoutAllDevicesHandler,
  me,
  refresh,
  register,
  resendVerificationHandler,
  resetPasswordHandler,
  setStaffActiveHandler,
  updateProfileHandler,
  verifyEmailHandler,
} from "./auth.controller";

export const authRouter = Router();

authRouter.post("/register", authRateLimiter, register);
authRouter.post("/login", authRateLimiter, login);
authRouter.post("/refresh", refresh);
authRouter.post("/logout", logout);
authRouter.post("/logout-all", requireAuth, logoutAllDevicesHandler);
authRouter.get("/me", requireAuth, me);
authRouter.patch("/profile", requireAuth, updateProfileHandler);
authRouter.post("/forgot-password", authRateLimiter, forgotPassword);
authRouter.post("/reset-password", authRateLimiter, resetPasswordHandler);
authRouter.post("/change-password", requireAuth, changePasswordHandler);
authRouter.post("/verify-email", authRateLimiter, verifyEmailHandler);
authRouter.post("/resend-verification", requireAuth, authRateLimiter, resendVerificationHandler);
authRouter.post("/staff", requireAuth, requireRole(Role.RESTAURANT_OWNER), inviteStaff);
authRouter.get("/staff", requireAuth, requireRole(Role.RESTAURANT_OWNER), listStaffHandler);
authRouter.patch("/staff/:id", requireAuth, requireRole(Role.RESTAURANT_OWNER), setStaffActiveHandler);
