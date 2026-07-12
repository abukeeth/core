import { Role } from "@prisma/client";
import { Router } from "express";
import { requireAuth } from "../../../middleware/require-auth";
import { requireRole } from "../../../middleware/require-role";
import { staffActionRateLimiter } from "../../../middleware/rate-limit";
import { getRevenueSummaryHandler, getRevenueByDayHandler, getTopItemsHandler } from "./analytics.controller";

const staffOrOwner = requireRole(Role.RESTAURANT_OWNER, Role.RESTAURANT_STAFF);

// Mounted at "/api/restaurants" myself.
export const analyticsRouter = Router();
analyticsRouter.get(
  "/me/analytics/summary",
  requireAuth,
  staffOrOwner,
  staffActionRateLimiter,
  getRevenueSummaryHandler,
);
analyticsRouter.get(
  "/me/analytics/revenue-by-day",
  requireAuth,
  staffOrOwner,
  staffActionRateLimiter,
  getRevenueByDayHandler,
);
analyticsRouter.get(
  "/me/analytics/top-items",
  requireAuth,
  staffOrOwner,
  staffActionRateLimiter,
  getTopItemsHandler,
);
