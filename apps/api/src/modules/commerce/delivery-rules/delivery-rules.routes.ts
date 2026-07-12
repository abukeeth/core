import { Role } from "@prisma/client";
import { Router } from "express";
import { requireAuth } from "../../../middleware/require-auth";
import { requireRole } from "../../../middleware/require-role";
import { staffActionRateLimiter } from "../../../middleware/rate-limit";
import { getDeliveryConfigHandler, updateDeliveryConfigHandler } from "./delivery-config.controller";
import {
  createDeliveryFeeRuleHandler,
  createServiceFeeRuleHandler,
  deleteDeliveryFeeRuleHandler,
  deleteServiceFeeRuleHandler,
  listDeliveryFeeRulesHandler,
  listServiceFeeRulesHandler,
  updateDeliveryFeeRuleHandler,
  updateServiceFeeRuleHandler,
} from "./fee-rules.controller";
import { listHoursHandler, setHoursHandler } from "./hours.controller";
import { getKitchenCapacityHandler, updateKitchenCapacityHandler } from "./kitchen-capacity.controller";
import {
  createRuleHandler,
  createZoneHandler,
  deleteRuleHandler,
  deleteZoneHandler,
  listRulesHandler,
  listZonesHandler,
  updateRuleHandler,
  updateZoneHandler,
} from "./zones.controller";

// Mounted at "/api/restaurants" myself, so internal paths resolve to
// e.g. "/api/restaurants/me/hours".
export const deliveryRulesRouter = Router();

const staffOrOwner = requireRole(Role.RESTAURANT_OWNER, Role.RESTAURANT_STAFF);

deliveryRulesRouter.get("/me/hours", requireAuth, staffOrOwner, staffActionRateLimiter, listHoursHandler);
deliveryRulesRouter.put("/me/hours", requireAuth, staffOrOwner, staffActionRateLimiter, setHoursHandler);

deliveryRulesRouter.get("/me/delivery-config", requireAuth, staffOrOwner, staffActionRateLimiter, getDeliveryConfigHandler);
deliveryRulesRouter.patch("/me/delivery-config", requireAuth, staffOrOwner, staffActionRateLimiter, updateDeliveryConfigHandler);

deliveryRulesRouter.get("/me/delivery-fee-rules", requireAuth, staffOrOwner, staffActionRateLimiter, listDeliveryFeeRulesHandler);
deliveryRulesRouter.post("/me/delivery-fee-rules", requireAuth, staffOrOwner, staffActionRateLimiter, createDeliveryFeeRuleHandler);
deliveryRulesRouter.patch("/me/delivery-fee-rules/:id", requireAuth, staffOrOwner, staffActionRateLimiter, updateDeliveryFeeRuleHandler);
deliveryRulesRouter.delete("/me/delivery-fee-rules/:id", requireAuth, staffOrOwner, staffActionRateLimiter, deleteDeliveryFeeRuleHandler);

deliveryRulesRouter.get("/me/service-fee-rules", requireAuth, staffOrOwner, staffActionRateLimiter, listServiceFeeRulesHandler);
deliveryRulesRouter.post("/me/service-fee-rules", requireAuth, staffOrOwner, staffActionRateLimiter, createServiceFeeRuleHandler);
deliveryRulesRouter.patch("/me/service-fee-rules/:id", requireAuth, staffOrOwner, staffActionRateLimiter, updateServiceFeeRuleHandler);
deliveryRulesRouter.delete("/me/service-fee-rules/:id", requireAuth, staffOrOwner, staffActionRateLimiter, deleteServiceFeeRuleHandler);

deliveryRulesRouter.get("/me/kitchen-capacity", requireAuth, staffOrOwner, staffActionRateLimiter, getKitchenCapacityHandler);
deliveryRulesRouter.patch("/me/kitchen-capacity", requireAuth, staffOrOwner, staffActionRateLimiter, updateKitchenCapacityHandler);

deliveryRulesRouter.get("/me/delivery-zones", requireAuth, staffOrOwner, staffActionRateLimiter, listZonesHandler);
deliveryRulesRouter.post("/me/delivery-zones", requireAuth, staffOrOwner, staffActionRateLimiter, createZoneHandler);
deliveryRulesRouter.patch("/me/delivery-zones/:id", requireAuth, staffOrOwner, staffActionRateLimiter, updateZoneHandler);
deliveryRulesRouter.delete("/me/delivery-zones/:id", requireAuth, staffOrOwner, staffActionRateLimiter, deleteZoneHandler);

deliveryRulesRouter.get("/me/delivery-rules", requireAuth, staffOrOwner, staffActionRateLimiter, listRulesHandler);
deliveryRulesRouter.post("/me/delivery-rules", requireAuth, staffOrOwner, staffActionRateLimiter, createRuleHandler);
deliveryRulesRouter.patch("/me/delivery-rules/:id", requireAuth, staffOrOwner, staffActionRateLimiter, updateRuleHandler);
deliveryRulesRouter.delete("/me/delivery-rules/:id", requireAuth, staffOrOwner, staffActionRateLimiter, deleteRuleHandler);
