import { Role } from "@prisma/client";
import { Router } from "express";
import { requireAuth } from "../../../middleware/require-auth";
import { requireRole } from "../../../middleware/require-role";
import { staffActionRateLimiter } from "../../../middleware/rate-limit";
import { getInventoryHandler, toggleOutOfStockHandler, updateInventoryHandler } from "./inventory.controller";
import {
  attachModifierGroupHandler,
  createModifierGroupHandler,
  createModifierOptionHandler,
  deleteModifierGroupHandler,
  deleteModifierOptionHandler,
  detachModifierGroupHandler,
  listItemModifierGroupsHandler,
  listModifierGroupsHandler,
  updateModifierGroupHandler,
  updateModifierOptionHandler,
} from "./modifiers.controller";
import { createVariantHandler, deleteVariantHandler, listVariantsHandler, updateVariantHandler } from "./variants.controller";

// Mounted at "/api/restaurants" myself, so internal paths resolve to
// e.g. "/api/restaurants/me/menu-items/:itemId/variants".
export const menuCommerceRouter = Router();

const staffOrOwner = requireRole(Role.RESTAURANT_OWNER, Role.RESTAURANT_STAFF);

menuCommerceRouter.get("/me/menu-items/:itemId/variants", requireAuth, staffOrOwner, staffActionRateLimiter, listVariantsHandler);
menuCommerceRouter.post("/me/menu-items/:itemId/variants", requireAuth, staffOrOwner, staffActionRateLimiter, createVariantHandler);
menuCommerceRouter.patch("/me/menu-items/:itemId/variants/:variantId", requireAuth, staffOrOwner, staffActionRateLimiter, updateVariantHandler);
menuCommerceRouter.delete("/me/menu-items/:itemId/variants/:variantId", requireAuth, staffOrOwner, staffActionRateLimiter, deleteVariantHandler);

menuCommerceRouter.get("/me/modifier-groups", requireAuth, staffOrOwner, staffActionRateLimiter, listModifierGroupsHandler);
menuCommerceRouter.post("/me/modifier-groups", requireAuth, staffOrOwner, staffActionRateLimiter, createModifierGroupHandler);
menuCommerceRouter.patch("/me/modifier-groups/:id", requireAuth, staffOrOwner, staffActionRateLimiter, updateModifierGroupHandler);
menuCommerceRouter.delete("/me/modifier-groups/:id", requireAuth, staffOrOwner, staffActionRateLimiter, deleteModifierGroupHandler);

menuCommerceRouter.post("/me/modifier-groups/:id/options", requireAuth, staffOrOwner, staffActionRateLimiter, createModifierOptionHandler);
menuCommerceRouter.patch("/me/modifier-groups/:id/options/:optionId", requireAuth, staffOrOwner, staffActionRateLimiter, updateModifierOptionHandler);
menuCommerceRouter.delete("/me/modifier-groups/:id/options/:optionId", requireAuth, staffOrOwner, staffActionRateLimiter, deleteModifierOptionHandler);

menuCommerceRouter.post("/me/menu-items/:itemId/modifier-groups", requireAuth, staffOrOwner, staffActionRateLimiter, attachModifierGroupHandler);
menuCommerceRouter.delete(
  "/me/menu-items/:itemId/modifier-groups/:modifierGroupId",
  requireAuth,
  staffOrOwner,
  staffActionRateLimiter,
  detachModifierGroupHandler,
);

menuCommerceRouter.get(
  "/me/menu-items/:itemId/modifier-groups",
  requireAuth,
  staffOrOwner,
  staffActionRateLimiter,
  listItemModifierGroupsHandler,
);

menuCommerceRouter.get("/me/menu-items/:itemId/inventory", requireAuth, staffOrOwner, staffActionRateLimiter, getInventoryHandler);
menuCommerceRouter.patch("/me/menu-items/:itemId/inventory", requireAuth, staffOrOwner, staffActionRateLimiter, updateInventoryHandler);
menuCommerceRouter.patch("/me/menu-items/:itemId/86", requireAuth, staffOrOwner, staffActionRateLimiter, toggleOutOfStockHandler);
