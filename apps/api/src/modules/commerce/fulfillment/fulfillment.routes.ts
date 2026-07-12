import { Role } from "@prisma/client";
import { Router } from "express";
import { requireAuth } from "../../../middleware/require-auth";
import { requireRole } from "../../../middleware/require-role";
import { staffActionRateLimiter } from "../../../middleware/rate-limit";
import {
  assignDriverHandler,
  connectProviderHandler,
  disconnectProviderHandler,
  listDriverCandidatesHandler,
  listProvidersHandler,
  locationPingHandler,
  myAssignmentsHandler,
  respondToAssignmentHandler,
  updateFulfillmentStatusHandler,
} from "./fulfillment.controller";

// Mounted at "/api/restaurants" alongside restaurantRouter, so these
// routes resolve to e.g. "/api/restaurants/me/fulfillment-providers".
export const fulfillmentRouter = Router();

const staffOrOwner = requireRole(Role.RESTAURANT_OWNER, Role.RESTAURANT_STAFF);

fulfillmentRouter.get("/me/fulfillment-providers", requireAuth, staffOrOwner, staffActionRateLimiter, listProvidersHandler);
fulfillmentRouter.post("/me/fulfillment-providers/:type/connect", requireAuth, staffOrOwner, staffActionRateLimiter, connectProviderHandler);
fulfillmentRouter.delete("/me/fulfillment-providers/:type", requireAuth, staffOrOwner, staffActionRateLimiter, disconnectProviderHandler);

fulfillmentRouter.get("/me/fulfillment/drivers", requireAuth, staffOrOwner, staffActionRateLimiter, listDriverCandidatesHandler);
fulfillmentRouter.post("/me/fulfillment/:id/assign-driver", requireAuth, staffOrOwner, staffActionRateLimiter, assignDriverHandler);
fulfillmentRouter.patch("/me/fulfillment/:id/status", requireAuth, staffOrOwner, staffActionRateLimiter, updateFulfillmentStatusHandler);
fulfillmentRouter.post("/me/fulfillment/:id/location-ping", requireAuth, staffOrOwner, staffActionRateLimiter, locationPingHandler);

// The driver app's own queue — deliberately placed under /me/fulfillment
// alongside the staff-facing actions above (same tenant/role scope), not
// under /me/fulfillment-providers (which is BYO-delivery *provider*
// connection management, an unrelated concern).
fulfillmentRouter.get("/me/fulfillment/my-assignments", requireAuth, staffOrOwner, staffActionRateLimiter, myAssignmentsHandler);
fulfillmentRouter.post("/me/fulfillment/assignments/:id/respond", requireAuth, staffOrOwner, staffActionRateLimiter, respondToAssignmentHandler);
