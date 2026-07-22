import { Router } from "express";
import { Role } from "@prisma/client";
import { requireAuth } from "../../middleware/require-auth";
import { requireRole } from "../../middleware/require-role";
import {
  deleteRestaurantHandler,
  listOrdersHandler,
  listPaymentsHandler,
  listRestaurantsHandler,
  listUsersHandler,
  setUserActiveHandler,
} from "./admin.controller";

/** Super Admin MVP (launch sprint) — mounted at /api/admin alongside the audit-log router. */
export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole(Role.ADMIN));

adminRouter.get("/users", listUsersHandler);
adminRouter.patch("/users/:id/active", setUserActiveHandler);
adminRouter.get("/restaurants-detailed", listRestaurantsHandler);
adminRouter.delete("/restaurants/:id", deleteRestaurantHandler);
adminRouter.get("/orders", listOrdersHandler);
adminRouter.get("/payments", listPaymentsHandler);
