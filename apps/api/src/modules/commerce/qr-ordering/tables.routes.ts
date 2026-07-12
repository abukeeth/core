import { Role } from "@prisma/client";
import { Router } from "express";
import { publicCommerceRateLimiter } from "../../../middleware/rate-limit";
import { requireAuth } from "../../../middleware/require-auth";
import { requireRole } from "../../../middleware/require-role";
import {
  createTableHandler,
  deleteTableHandler,
  listTablesHandler,
  regenerateQrTokenHandler,
  resolveTableHandler,
  updateTableHandler,
} from "./tables.controller";

// Mounted at "/api/restaurants" myself, so internal paths resolve to
// e.g. "/api/restaurants/me/tables".
export const tablesRouter = Router();

const staffOrOwner = requireRole(Role.RESTAURANT_OWNER, Role.RESTAURANT_STAFF);

tablesRouter.get("/me/tables", requireAuth, staffOrOwner, listTablesHandler);
tablesRouter.post("/me/tables", requireAuth, staffOrOwner, createTableHandler);
tablesRouter.patch("/me/tables/:id", requireAuth, staffOrOwner, updateTableHandler);
tablesRouter.delete("/me/tables/:id", requireAuth, staffOrOwner, deleteTableHandler);
tablesRouter.post("/me/tables/:id/regenerate-qr-token", requireAuth, staffOrOwner, regenerateQrTokenHandler);

// Public, unauthenticated QR-scan resolution — mounted at "/api/public" myself.
export const publicTablesRouter = Router();
publicTablesRouter.get("/tables/:qrToken", publicCommerceRateLimiter, resolveTableHandler);
