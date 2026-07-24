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
  // CONFIRMED is the real first milestone written at placement (checkout.service);
  // without this key it rendered the raw enum "CONFIRMED" to the customer.
  CONFIRMED: "Order placed",
  PLACED: "Order placed",
  PREPARING: "Kitchen is preparing your order",
  READY: "Order is ready",
  OUT_FOR_DELIVERY: "Out for delivery",
  COMPLETED: "Delivered / picked up",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};

// Once an order reaches one of these it will never change again, so tracking
// stops polling.
const TERMINAL_STATUSES = new Set(["COMPLETED", "CANCELLED", "REFUNDED", "FAILED"]);
const TRACK_POLL_MS = 10_000;

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

  // Live updates: poll the order + timeline so merchant status changes
  // (PREPARING → READY → OUT_FOR_DELIVERY → COMPLETED, or a cancellation) reach
  // the customer without a manual refresh. Stops once the order is terminal.
  useEffect(() => {
    if (order && TERMINAL_STATUSES.has(order.status.toUpperCase())) return;
    const interval = setInterval(() => {
      void load();
    }, TRACK_POLL_MS);
    return () => clearInterval(interval);
  }, [order, load]);

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
    return <p className="p-8 text-sm text-danger">{error}</p>;
  }

  if (!order) {
    return <p className="p-8 text-sm text-ink-secondary">Loading…</p>;
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-canvas p-6">
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-ink font-display">Order #{order.orderNumber}</h1>
          <button type="button" onClick={load} className="text-sm text-ink-secondary">
            Refresh
          </button>
        </div>

        <p className="text-sm text-ink-secondary">Current status: {order.status}</p>

        <ol className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
          {timeline.length === 0 && (
            <li className="text-sm text-ink-secondary">No updates yet.</li>
          )}
          {timeline.map((entry) => (
            <li key={entry.id} className="flex justify-between text-sm">
              <span>{MILESTONE_LABELS[entry.milestone] ?? entry.milestone}</span>
              <span className="text-ink-muted">{new Date(entry.occurredAt).toLocaleTimeString()}</span>
            </li>
          ))}
        </ol>

        {loggedIn && order.status === "COMPLETED" && review !== undefined && (
          <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
            {review ? (
              <>
                <span className="text-sm font-medium text-ink-secondary">Your review</span>
                <span className="text-lg">{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span>
                {review.comment && <p className="text-sm text-ink-secondary">{review.comment}</p>}
              </>
            ) : (
              <form onSubmit={handleSubmitReview} className="flex flex-col gap-3">
                <span className="text-sm font-medium text-ink-secondary">How was your order?</span>
                {reviewError && <p className="text-sm text-danger">{reviewError}</p>}
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
                  className="rounded border border-line px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="self-start rounded-full bg-brand px-4 py-2 text-sm text-white disabled:opacity-50"
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
