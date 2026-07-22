import { Role } from "@prisma/client";
import { Router } from "express";
import { denyFinancialForKitchen } from "../../../middleware/deny-financial-for-kitchen";
import { requireAuth } from "../../../middleware/require-auth";
import { requireRole } from "../../../middleware/require-role";
import { staffActionRateLimiter } from "../../../middleware/rate-limit";
import { getRevenueSummaryHandler, getRevenueByDayHandler, getTopItemsHandler, getFinancialSummaryHandler } from "./analytics.controller";

const staffOrOwner = requireRole(Role.RESTAURANT_OWNER, Role.RESTAURANT_STAFF);

// Mounted at "/api/restaurants" myself.
export const analyticsRouter = Router();
analyticsRouter.get(
  "/me/analytics/summary",
  requireAuth,
  staffOrOwner,
  denyFinancialForKitchen,
  staffActionRateLimiter,
  getRevenueSummaryHandler,
);
analyticsRouter.get(
  "/me/analytics/revenue-by-day",
  requireAuth,
  staffOrOwner,
  denyFinancialForKitchen,
  staffActionRateLimiter,
  getRevenueByDayHandler,
);
analyticsRouter.get(
  "/me/analytics/top-items",
  requireAuth,
  staffOrOwner,
  denyFinancialForKitchen,
  staffActionRateLimiter,
  getTopItemsHandler,
);
analyticsRouter.get(
  "/me/analytics/financial-summary",
  requireAuth,
  staffOrOwner,
  denyFinancialForKitchen,
  staffActionRateLimiter,
  getFinancialSummaryHandler,
);
