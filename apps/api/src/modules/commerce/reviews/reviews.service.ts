import { Prisma } from "@prisma/client";
import type { Review } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { OrderAlreadyReviewedError, OrderNotReviewableError } from "./reviews.errors";
import type { CreateReviewInput } from "./reviews.validation";

/**
 * The Review.orderId unique constraint is what actually prevents a
 * second review for the same order under concurrent duplicate submits —
 * this function's own order.status/customerId check is a non-
 * authoritative UX check (same convention as this codebase's coupon and
 * loyalty redemption checks), so the P2002 catch below is the real
 * guarantee, not this check.
 */
export async function createReview(customerId: string, orderId: string, input: CreateReviewInput): Promise<Review> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.customerId !== customerId || order.status !== "COMPLETED") {
    throw new OrderNotReviewableError();
  }

  try {
    return await prisma.review.create({
      data: { restaurantId: order.restaurantId, customerId, orderId, rating: input.rating, comment: input.comment },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new OrderAlreadyReviewedError();
    }
    throw err;
  }
}

export type PublicReview = Pick<Review, "id" | "rating" | "comment" | "createdAt"> & { customerFirstName: string };

export async function listRestaurantReviews(restaurantId: string, limit = 20, offset = 0): Promise<PublicReview[]> {
  const reviews = await prisma.review.findMany({
    where: { restaurantId },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
    include: { customer: { select: { name: true } } },
  });
  return reviews.map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.createdAt,
    customerFirstName: r.customer.name.split(" ")[0] ?? r.customer.name,
  }));
}

export interface RatingSummary {
  averageRating: number | null;
  reviewCount: number;
}

export async function getRatingSummary(restaurantId: string): Promise<RatingSummary> {
  const result = await prisma.review.aggregate({
    where: { restaurantId },
    _avg: { rating: true },
    _count: true,
  });
  return { averageRating: result._avg.rating, reviewCount: result._count };
}

export async function getOwnReviewForOrder(customerId: string, orderId: string): Promise<Review | null> {
  const review = await prisma.review.findUnique({ where: { orderId } });
  if (!review || review.customerId !== customerId) return null;
  return review;
}
