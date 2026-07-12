import { Router } from "express";
import { publicCommerceRateLimiter } from "../../../middleware/rate-limit";
import { getPublicMenuHandler } from "./public-menu.controller";

// Public, unauthenticated menu browsing — mounted at "/api/public" myself,
// so this resolves to "/api/public/restaurants/:restaurantId/menu",
// matching cart.routes.ts's "/restaurants/:restaurantId/cart" sibling path.
export const publicMenuRouter = Router();
publicMenuRouter.get("/restaurants/:restaurantId/menu", publicCommerceRateLimiter, getPublicMenuHandler);
