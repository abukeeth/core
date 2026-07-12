import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/prisma", () => ({
  prisma: {
    order: { findUnique: vi.fn() },
    review: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), aggregate: vi.fn() },
  },
}));

import { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { OrderAlreadyReviewedError, OrderNotReviewableError } from "./reviews.errors";
import { createReview, getRatingSummary, listRestaurantReviews } from "./reviews.service";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
});

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    restaurantId: "r1",
    customerId: "cust-1",
    status: "COMPLETED",
    ...overrides,
  } as never;
}

describe("createReview", () => {
  it("rejects an order that doesn't belong to this customer", async () => {
    mockPrisma.order.findUnique.mockResolvedValue(order({ customerId: "someone-else" }));
    await expect(createReview("cust-1", "order-1", { rating: 5 })).rejects.toBeInstanceOf(OrderNotReviewableError);
    expect(mockPrisma.review.create).not.toHaveBeenCalled();
  });

  it("rejects an order that isn't COMPLETED yet", async () => {
    mockPrisma.order.findUnique.mockResolvedValue(order({ status: "PREPARING" }));
    await expect(createReview("cust-1", "order-1", { rating: 5 })).rejects.toBeInstanceOf(OrderNotReviewableError);
  });

  it("rejects a nonexistent order", async () => {
    mockPrisma.order.findUnique.mockResolvedValue(null);
    await expect(createReview("cust-1", "order-1", { rating: 5 })).rejects.toBeInstanceOf(OrderNotReviewableError);
  });

  it("creates the review for a valid, own, completed order", async () => {
    mockPrisma.order.findUnique.mockResolvedValue(order());
    mockPrisma.review.create.mockResolvedValue({ id: "review-1" } as never);

    const review = await createReview("cust-1", "order-1", { rating: 4, comment: "Great!" });

    expect(review).toEqual({ id: "review-1" });
    expect(mockPrisma.review.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ restaurantId: "r1", customerId: "cust-1", orderId: "order-1", rating: 4 }) }),
    );
  });

  it("closes the double-submit race: a duplicate review for the same order maps the DB's unique-constraint violation to OrderAlreadyReviewedError", async () => {
    mockPrisma.order.findUnique.mockResolvedValue(order());
    const p2002 = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
    });
    mockPrisma.review.create.mockRejectedValue(p2002);

    await expect(createReview("cust-1", "order-1", { rating: 5 })).rejects.toBeInstanceOf(OrderAlreadyReviewedError);
  });
});

describe("listRestaurantReviews", () => {
  it("maps each review to only the customer's first name", async () => {
    mockPrisma.review.findMany.mockResolvedValue([
      { id: "r1", rating: 5, comment: "Loved it", createdAt: new Date(), customer: { name: "Jane Doe" } },
    ] as never);

    const reviews = await listRestaurantReviews("rest-1");

    expect(reviews).toEqual([
      expect.objectContaining({ id: "r1", rating: 5, comment: "Loved it", customerFirstName: "Jane" }),
    ]);
  });
});

describe("getRatingSummary", () => {
  it("returns the average rating and count from the aggregate", async () => {
    mockPrisma.review.aggregate.mockResolvedValue({ _avg: { rating: 4.5 }, _count: 10 } as never);

    const summary = await getRatingSummary("rest-1");

    expect(summary).toEqual({ averageRating: 4.5, reviewCount: 10 });
  });

  it("returns a null average when there are no reviews yet", async () => {
    mockPrisma.review.aggregate.mockResolvedValue({ _avg: { rating: null }, _count: 0 } as never);

    const summary = await getRatingSummary("rest-1");

    expect(summary).toEqual({ averageRating: null, reviewCount: 0 });
  });
});
