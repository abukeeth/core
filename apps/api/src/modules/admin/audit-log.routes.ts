import { Role } from "@prisma/client";
import { Router } from "express";
import { requireAuth } from "../../middleware/require-auth";
import { requireRole } from "../../middleware/require-role";
import { listAuditLogHandler } from "./audit-log.controller";

// Mounted at "/api/admin" myself.
export const adminAuditLogRouter = Router();
adminAuditLogRouter.get("/audit-log", requireAuth, requireRole(Role.ADMIN), listAuditLogHandler);
