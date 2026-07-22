import { Role } from "@prisma/client";
import { Router } from "express";
import { denyFinancialForKitchen } from "../../../middleware/deny-financial-for-kitchen";
import { requireAuth } from "../../../middleware/require-auth";
import { requireRole } from "../../../middleware/require-role";
import { staffActionRateLimiter } from "../../../middleware/rate-limit";
import { getCustomerHandler, listCustomersHandler } from "./customers-owner.controller";

const staffOrOwner = requireRole(Role.RESTAURANT_OWNER, Role.RESTAURANT_STAFF);

// Mounted at "/api/restaurants" myself. Customer spend is financial data, so
// the same kitchen-staff financial guard as analytics applies.
export const customersOwnerRouter = Router();
customersOwnerRouter.get(
  "/me/customers",
  requireAuth,
  staffOrOwner,
  denyFinancialForKitchen,
  staffActionRateLimiter,
  listCustomersHandler,
);
customersOwnerRouter.get(
  "/me/customers/:id",
  requireAuth,
  staffOrOwner,
  denyFinancialForKitchen,
  staffActionRateLimiter,
  getCustomerHandler,
);
