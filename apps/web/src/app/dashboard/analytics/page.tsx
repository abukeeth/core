"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/ui";
import {
  getRevenueByDay,
  getRevenueSummary,
  getTopItems,
  type RevenueByDay,
  type RevenueSummary,
  type TopItem,
} from "@/lib/owner-commerce-api";

const RANGE_OPTIONS = [7, 30, 90];

function formatPrice(cents: number): string {
  return (cents / 100).toFixed(2);
}

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState<RevenueSummary | null>(null);
  const [byDay, setByDay] = useState<RevenueByDay[]>([]);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [summaryResult, byDayResult, topItemsResult] = await Promise.all([
          getRevenueSummary(days),
          getRevenueByDay(days),
          getTopItems(days, 10),
        ]);
        if (cancelled) return;
        setSummary(summaryResult);
        setByDay(byDayResult.days);
        setTopItems(topItemsResult.items);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load analytics");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [days]);

  const maxDayRevenue = Math.max(1, ...byDay.map((d) => d.revenueCents));

  return (
    <PageShell maxWidth="4xl">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Analytics</h1>
          <div className="flex gap-2">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setDays(option)}
                className={`rounded-full px-4 py-1.5 text-sm ${
                  days === option
                    ? "bg-foreground text-background"
                    : "border border-black/[.08] text-zinc-600 dark:border-white/[.145] dark:text-zinc-400"
                }`}
              >
                {option}d
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {loading && !summary && <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading…</p>}

        {summary && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-950">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">Revenue</span>
              <p className="text-2xl font-semibold text-black dark:text-zinc-50">${formatPrice(summary.totalRevenueCents)}</p>
            </div>
            <div className="rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-950">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">Orders</span>
              <p className="text-2xl font-semibold text-black dark:text-zinc-50">{summary.totalOrders}</p>
            </div>
            <div className="rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-950">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">Average order value</span>
              <p className="text-2xl font-semibold text-black dark:text-zinc-50">${formatPrice(summary.averageOrderValueCents)}</p>
            </div>
          </div>
        )}

        {summary && Object.keys(summary.ordersByStatus).length > 0 && (
          <div className="flex flex-wrap gap-3 rounded-lg border border-black/[.08] bg-white p-4 text-sm dark:border-white/[.145] dark:bg-zinc-950">
            {Object.entries(summary.ordersByStatus).map(([status, count]) => (
              <span key={status} className="text-zinc-600 dark:text-zinc-400">
                {status}: <span className="font-medium text-black dark:text-zinc-50">{count}</span>
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-3 rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-950">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Revenue by day</h2>
          {byDay.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No orders in this range.</p>
          ) : (
            <div className="flex h-40 items-end gap-1">
              {byDay.map((entry) => (
                <div
                  key={String(entry.day)}
                  className="flex-1 rounded-t bg-foreground/80"
                  style={{ height: `${Math.max(4, (entry.revenueCents / maxDayRevenue) * 100)}%` }}
                  title={`${new Date(entry.day).toLocaleDateString()}: $${formatPrice(entry.revenueCents)} (${entry.orderCount} orders)`}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-950">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Top selling items</h2>
          {topItems.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No item sales in this range.</p>
          ) : (
            <ol className="flex flex-col divide-y divide-black/[.08] dark:divide-white/[.145]">
              {topItems.map((item, index) => (
                <li key={item.menuItemId} className="flex items-center justify-between gap-4 py-2 text-sm">
                  <span className="text-black dark:text-zinc-50">
                    {index + 1}. {item.name}
                  </span>
                  <span className="text-zinc-600 dark:text-zinc-400">
                    {item.quantitySold} sold · ${formatPrice(item.revenueCents)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
    </PageShell>
  );
}
