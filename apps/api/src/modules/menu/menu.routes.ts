import { Router } from "express";
import { Role } from "@prisma/client";
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
} from "./menu.controller";

export const menuRouter = Router();

const staffOrOwner = requireRole(Role.RESTAURANT_OWNER, Role.RESTAURANT_STAFF);

menuRouter.get("/categories", requireAuth, staffOrOwner, listCategoriesHandler);
menuRouter.post("/categories", requireAuth, staffOrOwner, createCategoryHandler);
menuRouter.patch("/categories/:id", requireAuth, staffOrOwner, updateCategoryHandler);
menuRouter.delete("/categories/:id", requireAuth, staffOrOwner, deleteCategoryHandler);

menuRouter.post("/items", requireAuth, staffOrOwner, createItemHandler);
menuRouter.patch("/items/:id", requireAuth, staffOrOwner, updateItemHandler);
menuRouter.delete("/items/:id", requireAuth, staffOrOwner, deleteItemHandler);
