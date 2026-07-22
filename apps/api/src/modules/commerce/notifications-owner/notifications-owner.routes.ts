import { Role } from "@prisma/client";
import { Router } from "express";
import { denyFinancialForKitchen } from "../../../middleware/deny-financial-for-kitchen";
import { requireAuth } from "../../../middleware/require-auth";
import { requireRole } from "../../../middleware/require-role";
import { staffActionRateLimiter } from "../../../middleware/rate-limit";
import { listNotificationsHandler } from "./notifications-owner.controller";

const staffOrOwner = requireRole(Role.RESTAURANT_OWNER, Role.RESTAURANT_STAFF);

// Mounted at "/api/restaurants" myself. Payment/refund notifications are
// financial, so the same kitchen-staff financial guard as analytics applies.
export const notificationsOwnerRouter = Router();
notificationsOwnerRouter.get(
  "/me/notifications",
  requireAuth,
  staffOrOwner,
  denyFinancialForKitchen,
  staffActionRateLimiter,
  listNotificationsHandler,
);
