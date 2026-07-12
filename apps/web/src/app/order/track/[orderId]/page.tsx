"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  customerMe,
  getOwnReview,
  getPublicOrder,
  getPublicOrderTimeline,
  submitReview,
  type Order,
  type OrderTimelineEntry,
  type Review,
} from "@/lib/commerce-api";

const MILESTONE_LABELS: Record<string, string> = {
  PLACED: "Order placed",
  PREPARING: "Kitchen is preparing your order",
  READY: "Order is ready",
  OUT_FOR_DELIVERY: "Out for delivery",
  COMPLETED: "Delivered / picked up",
  CANCELLED: "Cancelled",
};

export default function OrderTrackingPage() {
  const params = useParams<{ orderId: string }>();
  const orderId = params.orderId;

  const [order, setOrder] = useState<Order | null>(null);
  const [timeline, setTimeline] = useState<OrderTimelineEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [loggedIn, setLoggedIn] = useState(false);
  const [review, setReview] = useState<Review | null | undefined>(undefined);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [{ order: loadedOrder }, { timeline: loadedTimeline }] = await Promise.all([
        getPublicOrder(orderId),
        getPublicOrderTimeline(orderId),
      ]);
      setOrder(loadedOrder);
      setTimeline(loadedTimeline);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Order not found");
    }
  }, [orderId]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getPublicOrder(orderId), getPublicOrderTimeline(orderId)])
      .then(([{ order: loadedOrder }, { timeline: loadedTimeline }]) => {
        if (cancelled) return;
        setOrder(loadedOrder);
        setTimeline(loadedTimeline);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Order not found");
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  useEffect(() => {
    customerMe()
      .then(() => {
        setLoggedIn(true);
        return getOwnReview(orderId);
      })
      .then((result) => {
        if (result) setReview(result.review);
      })
      .catch(() => undefined);
  }, [orderId]);

  async function handleSubmitReview(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setReviewError(null);
    try {
      const { review: created } = await submitReview(orderId, { rating, comment: comment || undefined });
      setReview(created);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "Failed to submit review");
    } finally {
      setSubmitting(false);
    }
  }

  if (error) {
    return <p className="p-8 text-sm text-red-600">{error}</p>;
  }

  if (!order) {
    return <p className="p-8 text-sm text-zinc-600 dark:text-zinc-400">Loading…</p>;
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-zinc-50 p-6 dark:bg-black">
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Order #{order.orderNumber}</h1>
          <button type="button" onClick={load} className="text-sm text-zinc-600 dark:text-zinc-400">
            Refresh
          </button>
        </div>

        <p className="text-sm text-zinc-600 dark:text-zinc-400">Current status: {order.status}</p>

        <ol className="flex flex-col gap-3 rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-950">
          {timeline.length === 0 && (
            <li className="text-sm text-zinc-600 dark:text-zinc-400">No updates yet.</li>
          )}
          {timeline.map((entry) => (
            <li key={entry.id} className="flex justify-between text-sm">
              <span>{MILESTONE_LABELS[entry.milestone] ?? entry.milestone}</span>
              <span className="text-zinc-500">{new Date(entry.occurredAt).toLocaleTimeString()}</span>
            </li>
          ))}
        </ol>

        {loggedIn && order.status === "COMPLETED" && review !== undefined && (
          <div className="flex flex-col gap-3 rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-950">
            {review ? (
              <>
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Your review</span>
                <span className="text-lg">{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span>
                {review.comment && <p className="text-sm text-zinc-600 dark:text-zinc-400">{review.comment}</p>}
              </>
            ) : (
              <form onSubmit={handleSubmitReview} className="flex flex-col gap-3">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">How was your order?</span>
                {reviewError && <p className="text-sm text-red-600">{reviewError}</p>}
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className="text-2xl leading-none"
                      aria-label={`${star} stars`}
                    >
                      {star <= rating ? "★" : "☆"}
                    </button>
                  ))}
                </div>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Optional comment"
                  className="rounded border border-black/[.08] px-3 py-2 text-sm dark:border-white/[.145] dark:bg-black"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="self-start rounded-full bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50"
                >
                  {submitting ? "Submitting…" : "Submit review"}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
