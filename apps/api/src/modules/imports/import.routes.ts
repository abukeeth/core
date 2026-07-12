import { Role } from "@prisma/client";
import { Router } from "express";
import multer from "multer";
import { getNumberEnv } from "../../config/env";
import { importRateLimiter } from "../../middleware/rate-limit";
import { requireAuth } from "../../middleware/require-auth";
import { requireRole } from "../../middleware/require-role";
import { approve, create, getOne, list, reject, rerun, updateData } from "./import.controller";

const MAX_FILE_SIZE_BYTES = getNumberEnv("IMPORT_MAX_FILE_SIZE_BYTES", 10 * 1024 * 1024);

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, callback) => {
    callback(null, ALLOWED_MIME_TYPES.has(file.mimetype));
  },
});

export const importRouter = Router();

const staffOrOwner = requireRole(Role.RESTAURANT_OWNER, Role.RESTAURANT_STAFF);

importRouter.post("/", requireAuth, staffOrOwner, importRateLimiter, upload.single("file"), create);
importRouter.get("/", requireAuth, staffOrOwner, list);
importRouter.get("/:id", requireAuth, staffOrOwner, getOne);
importRouter.patch("/:id", requireAuth, staffOrOwner, updateData);
importRouter.post("/:id/approve", requireAuth, staffOrOwner, approve);
importRouter.post("/:id/reject", requireAuth, staffOrOwner, reject);
importRouter.post("/:id/rerun", requireAuth, staffOrOwner, importRateLimiter, rerun);
