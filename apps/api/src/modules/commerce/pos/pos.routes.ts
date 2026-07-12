import { Role } from "@prisma/client";
import { Router } from "express";
import { requireAuth } from "../../../middleware/require-auth";
import { requireRole } from "../../../middleware/require-role";
import { staffActionRateLimiter } from "../../../middleware/rate-limit";
import {
  connectProviderHandler,
  disconnectProviderHandler,
  listProvidersHandler,
  listSyncLogsHandler,
  triggerSyncHandler,
  updateSyncDirectionHandler,
} from "./pos.controller";

// Mounted at "/api/restaurants" myself, so internal paths resolve to
// e.g. "/api/restaurants/me/pos-providers".
export const posRouter = Router();

const staffOrOwner = requireRole(Role.RESTAURANT_OWNER, Role.RESTAURANT_STAFF);

posRouter.get("/me/pos-providers", requireAuth, staffOrOwner, staffActionRateLimiter, listProvidersHandler);
posRouter.post("/me/pos-providers/:type/connect", requireAuth, staffOrOwner, staffActionRateLimiter, connectProviderHandler);
posRouter.delete("/me/pos-providers/:type", requireAuth, staffOrOwner, staffActionRateLimiter, disconnectProviderHandler);
posRouter.patch("/me/pos-providers/:type/sync-direction", requireAuth, staffOrOwner, staffActionRateLimiter, updateSyncDirectionHandler);
posRouter.post("/me/pos-providers/:type/sync-now", requireAuth, staffOrOwner, staffActionRateLimiter, triggerSyncHandler);
posRouter.get("/me/pos-providers/:type/sync-log", requireAuth, staffOrOwner, staffActionRateLimiter, listSyncLogsHandler);
