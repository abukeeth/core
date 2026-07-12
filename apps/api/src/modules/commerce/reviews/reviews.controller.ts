import type { Request, Response } from "express";
import { OrderAlreadyReviewedError, OrderNotReviewableError } from "./reviews.errors";
import { createReview, getOwnReviewForOrder, getRatingSummary, listRestaurantReviews } from "./reviews.service";
import { createReviewSchema } from "./reviews.validation";

export async function createReviewHandler(req: Request, res: Response): Promise<void> {
  const parsed = createReviewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const review = await createReview(req.customer!.id, req.params.orderId as string, parsed.data);
    res.status(201).json({ review });
  } catch (err) {
    if (err instanceof OrderNotReviewableError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof OrderAlreadyReviewedError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function getOwnReviewHandler(req: Request, res: Response): Promise<void> {
  const review = await getOwnReviewForOrder(req.customer!.id, req.params.orderId as string);
  res.status(200).json({ review });
}

export async function listPublicReviewsHandler(req: Request, res: Response): Promise<void> {
  const [reviews, summary] = await Promise.all([
    listRestaurantReviews(req.params.restaurantId as string),
    getRatingSummary(req.params.restaurantId as string),
  ]);
  res.status(200).json({ reviews, ...summary });
}
