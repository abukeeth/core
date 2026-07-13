import { Router } from "express";
import { Role } from "@prisma/client";
import multer from "multer";
import { getNumberEnv } from "../../config/env";
import { requireAuth } from "../../middleware/require-auth";
import { requireRole } from "../../middleware/require-role";
import {
  createCategoryHandler,
  createItemHandler,
  deleteCategoryHandler,
  deleteItemHandler,
  listCategoriesHandler,
  updateCategoryHandler,
  updateItemHandler,
  uploadCategoryImageHandler,
  uploadItemImageHandler,
} from "./menu.controller";

// Same limits/allowlist as site.routes.ts's asset upload — one photo per
// category/item, no live rebuild of a separate storage seam needed here.
const MAX_IMAGE_SIZE_BYTES = getNumberEnv("SITE_MAX_ASSET_SIZE_BYTES", 8 * 1024 * 1024);
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

const menuImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE_BYTES },
  fileFilter: (_req, file, callback) => {
    callback(null, ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype));
  },
});

export const menuRouter = Router();

const staffOrOwner = requireRole(Role.RESTAURANT_OWNER, Role.RESTAURANT_STAFF);

menuRouter.get("/categories", requireAuth, staffOrOwner, listCategoriesHandler);
menuRouter.post("/categories", requireAuth, staffOrOwner, createCategoryHandler);
menuRouter.patch("/categories/:id", requireAuth, staffOrOwner, updateCategoryHandler);
menuRouter.post("/categories/:id/image", requireAuth, staffOrOwner, menuImageUpload.single("file"), uploadCategoryImageHandler);
menuRouter.delete("/categories/:id", requireAuth, staffOrOwner, deleteCategoryHandler);

menuRouter.post("/items", requireAuth, staffOrOwner, createItemHandler);
menuRouter.patch("/items/:id", requireAuth, staffOrOwner, updateItemHandler);
menuRouter.post("/items/:id/image", requireAuth, staffOrOwner, menuImageUpload.single("file"), uploadItemImageHandler);
menuRouter.delete("/items/:id", requireAuth, staffOrOwner, deleteItemHandler);
