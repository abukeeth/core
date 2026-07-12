import { Role } from "@prisma/client";
import { Router } from "express";
import { requireAuth } from "../../../middleware/require-auth";
import { requireRole } from "../../../middleware/require-role";
import { staffActionRateLimiter, publicCommerceRateLimiter } from "../../../middleware/rate-limit";
import { requireCustomerAuth } from "../customers/require-customer-auth";
import { getOwnProgramHandler, updateOwnProgramHandler, getCustomerAccountSummaryHandler } from "./loyalty.controller";

const staffOrOwner = requireRole(Role.RESTAURANT_OWNER, Role.RESTAURANT_STAFF);

// Mounted at "/api/restaurants" myself.
export const loyaltyOwnerRouter = Router();
loyaltyOwnerRouter.get("/me/loyalty-program", requireAuth, staffOrOwner, staffActionRateLimiter, getOwnProgramHandler);
loyaltyOwnerRouter.patch("/me/loyalty-program", requireAuth, staffOrOwner, staffActionRateLimiter, updateOwnProgramHandler);

// Mounted at "/api/customer" myself.
export const loyaltyCustomerRouter = Router();
loyaltyCustomerRouter.get(
  "/loyalty/:restaurantId",
  requireCustomerAuth,
  publicCommerceRateLimiter,
  getCustomerAccountSummaryHandler,
);
