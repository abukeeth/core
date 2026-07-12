import { Router } from "express";
import { Role } from "@prisma/client";
import { requireAuth } from "../../middleware/require-auth";
import { requireRole } from "../../middleware/require-role";
import {
  create,
  getMine,
  getOwnReferrals,
  listAll,
  setSetupStepHandler,
  suspend,
  unsuspend,
  updateMine,
} from "./restaurant.controller";

export const restaurantRouter = Router();

restaurantRouter.post("/", requireAuth, requireRole(Role.RESTAURANT_OWNER), create);
restaurantRouter.get("/me", requireAuth, requireRole(Role.RESTAURANT_OWNER, Role.RESTAURANT_STAFF), getMine);
restaurantRouter.patch("/me", requireAuth, requireRole(Role.RESTAURANT_OWNER), updateMine);
restaurantRouter.patch("/me/setup-step", requireAuth, requireRole(Role.RESTAURANT_OWNER), setSetupStepHandler);
restaurantRouter.get(
  "/me/referrals",
  requireAuth,
  requireRole(Role.RESTAURANT_OWNER, Role.RESTAURANT_STAFF),
  getOwnReferrals,
);

export const adminRestaurantRouter = Router();

adminRestaurantRouter.get("/", requireAuth, requireRole(Role.ADMIN), listAll);
adminRestaurantRouter.patch("/:id/suspend", requireAuth, requireRole(Role.ADMIN), suspend);
adminRestaurantRouter.patch("/:id/unsuspend", requireAuth, requireRole(Role.ADMIN), unsuspend);
