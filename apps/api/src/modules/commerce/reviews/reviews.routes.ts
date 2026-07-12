import { Router } from "express";
import { publicCommerceRateLimiter } from "../../../middleware/rate-limit";
import { requireCustomerAuth } from "../customers/require-customer-auth";
import { createReviewHandler, getOwnReviewHandler, listPublicReviewsHandler } from "./reviews.controller";

// Mounted at "/api/customer" myself.
export const reviewsCustomerRouter = Router();
reviewsCustomerRouter.post("/orders/:orderId/review", requireCustomerAuth, publicCommerceRateLimiter, createReviewHandler);
reviewsCustomerRouter.get("/orders/:orderId/review", requireCustomerAuth, publicCommerceRateLimiter, getOwnReviewHandler);

// Mounted at "/api/public" myself.
export const reviewsPublicRouter = Router();
reviewsPublicRouter.get("/restaurants/:restaurantId/reviews", publicCommerceRateLimiter, listPublicReviewsHandler);
