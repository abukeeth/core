"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/owner-shell";
import { getRestaurant } from "@/lib/api";
import { getRestaurantReviews, type PublicReview } from "@/lib/commerce-api";

/* Reviews — Figma "Owner Dashboard V3 / Reviews" (node 52:16). Real reviews via
 * the public restaurant reviews endpoint (scoped to the owner's restaurant).
 * The mock's reply-status, Google source, response-rate/recovered stats and
 * review-request automation have no backing data and are omitted; buckets are
 * derived from the real star ratings. */

function Stars({ rating, className = "text-brand" }: { rating: number; className?: string }) {
  return (
    <span aria-label={`${rating} out of 5`} className={`inline-flex ${className}`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} viewBox="0 0 20 20" className="h-3.5 w-3.5" fill={i <= Math.round(rating) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5">
          <path d="M10 1.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L10 15l-5.2 2.7 1-5.8L1.6 7.7l5.8-.8L10 1.6Z" strokeLinejoin="round" />
        </svg>
      ))}
    </span>
  );
}

function reviewDate(d: string) {
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function initialsOf(name: string) {
  return (name.trim()[0] ?? "?").toUpperCase();
}
function isWithin30Days(d: string) {
  return Date.now() - new Date(d).getTime() < 30 * 86400000;
}

type Bucket = "all" | "positive" | "attention";
const TABS: Array<[string, Bucket]> = [["All", "all"], ["Positive", "positive"], ["Needs attention", "attention"]];

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [avg, setAvg] = useState<number | null>(null);
  const [count, setCount] = useState(0);
  const [tab, setTab] = useState<Bucket>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { restaurant } = await getRestaurant();
        const res = await getRestaurantReviews(restaurant.id);
        if (cancelled) return;
        setReviews(res.reviews);
        setAvg(res.averageRating);
        setCount(res.reviewCount);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load reviews");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const distribution = useMemo(() => {
    const total = reviews.length || 1;
    return [5, 4, 3, 2, 1].map((star) => {
      const n = reviews.filter((r) => Math.round(r.rating) === star).length;
      return { star, pct: Math.round((n / total) * 100) };
    });
  }, [reviews]);

  const thisMonth = useMemo(() => reviews.filter((r) => isWithin30Days(r.createdAt)).length, [reviews]);

  const visible = useMemo(() => {
    return reviews
      .filter((r) => (tab === "positive" ? r.rating >= 4 : tab === "attention" ? r.rating <= 2 : true))
      .slice()
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [reviews, tab]);

  return (
    <DashboardShell active="/dashboard/reviews">
      <div>
        <h1 className="font-display text-[28px] font-semibold leading-[34px] tracking-[-0.3px]">Reviews</h1>
        <p className="mt-0.5 text-xs text-ink-muted">Build trust and recover unhappy customers</p>
      </div>

      {error && <div className="mt-4 rounded-[18px] border border-danger/25 bg-danger/5 px-4 py-3 text-sm font-medium text-danger">{error}</div>}

      {/* Rating summary */}
      <div className="mt-4 flex gap-4 rounded-[20px] bg-ink p-4 text-white">
        <div className="flex flex-col items-center justify-center px-2">
          <p className="font-display text-[40px] font-semibold leading-none">{avg != null ? avg.toFixed(1) : "—"}</p>
          <Stars rating={avg ?? 0} className="mt-1.5 text-brand" />
          <p className="mt-1.5 text-[11px] text-white/60">{count} review{count === 1 ? "" : "s"}</p>
        </div>
        <div className="flex-1 space-y-1.5 self-center">
          {distribution.map((d) => (
            <div key={d.star} className="flex items-center gap-2">
              <span className="w-2 text-[11px] text-white/60">{d.star}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
                <span className="block h-full rounded-full bg-brand" style={{ width: `${d.pct}%` }} />
              </span>
              <span className="w-8 text-right text-[11px] text-white/60">{d.pct}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="mt-3 grid grid-cols-3 gap-2.5">
        <div className="rounded-[17px] border border-line bg-surface p-3.5">
          <p className="font-display text-[22px] font-semibold leading-none text-ink">{count}</p>
          <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.2px] text-ink-secondary">Total</p>
        </div>
        <div className="rounded-[17px] border border-line bg-surface p-3.5">
          <p className="font-display text-[22px] font-semibold leading-none text-ink">{avg != null ? avg.toFixed(1) : "—"}</p>
          <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.2px] text-ink-secondary">Avg. rating</p>
        </div>
        <div className="rounded-[17px] border border-line bg-surface p-3.5">
          <p className="font-display text-[22px] font-semibold leading-none text-ink">{thisMonth}</p>
          <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.2px] text-ink-secondary">This month</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-3 flex gap-2">
        {TABS.map(([label, key]) => (
          <button key={key} type="button" onClick={() => setTab(key)}
            className={`rounded-full px-3.5 py-2 text-sm font-semibold transition ${tab === key ? "bg-ink text-white" : "border border-line bg-surface text-ink-secondary"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="mt-4 space-y-2.5">
        {loading ? (
          [0, 1, 2].map((i) => <div key={i} className="h-[92px] animate-pulse rounded-[18px] border border-line bg-surface" />)
        ) : visible.length === 0 ? (
          <div className="rounded-[18px] border border-line bg-surface px-4 py-10 text-center text-sm text-ink-secondary">
            {reviews.length === 0 ? "No reviews yet — they'll appear here after customers rate their orders." : "No reviews in this filter."}
          </div>
        ) : (
          visible.map((r) => (
            <div key={r.id} className={`rounded-[18px] border bg-surface p-4 ${r.rating <= 2 ? "border-danger/40" : "border-line"}`}>
              <div className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-brand-soft font-display text-sm font-semibold text-brand">{initialsOf(r.customerFirstName)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-[15px] font-medium text-ink">{r.customerFirstName}</p>
                  <div className="flex items-center gap-2">
                    <Stars rating={r.rating} />
                    <span className="text-xs text-ink-muted">Direct · {reviewDate(r.createdAt)}</span>
                  </div>
                </div>
              </div>
              {r.comment && <p className="mt-2.5 text-sm text-ink-secondary">{r.comment}</p>}
            </div>
          ))
        )}
      </div>
    </DashboardShell>
  );
}
