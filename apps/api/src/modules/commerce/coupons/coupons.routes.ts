import { Role } from "@prisma/client";
import { Router } from "express";
import { requireAuth } from "../../../middleware/require-auth";
import { requireRole } from "../../../middleware/require-role";
import { staffActionRateLimiter } from "../../../middleware/rate-limit";
import { createCouponHandler, deleteCouponHandler, listCouponsHandler, updateCouponHandler } from "./coupons.controller";

// Mounted at "/api/restaurants" myself, so internal paths resolve to
// e.g. "/api/restaurants/me/coupons".
export const couponsRouter = Router();

const staffOrOwner = requireRole(Role.RESTAURANT_OWNER, Role.RESTAURANT_STAFF);

couponsRouter.get("/me/coupons", requireAuth, staffOrOwner, staffActionRateLimiter, listCouponsHandler);
couponsRouter.post("/me/coupons", requireAuth, staffOrOwner, staffActionRateLimiter, createCouponHandler);
couponsRouter.patch("/me/coupons/:id", requireAuth, staffOrOwner, staffActionRateLimiter, updateCouponHandler);
couponsRouter.delete("/me/coupons/:id", requireAuth, staffOrOwner, staffActionRateLimiter, deleteCouponHandler);
