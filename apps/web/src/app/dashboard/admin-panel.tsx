"use client";

import { useState } from "react";
import {
  listAuditLog,
  suspendRestaurant,
  unsuspendRestaurant,
  type AuditLogEntry,
  type Restaurant,
} from "@/lib/api";

function formatAction(action: string): string {
  return action.replace(/_/g, " ").toLowerCase();
}

export function AdminPanel({
  initialRestaurants,
  initialAuditLog,
}: {
  initialRestaurants: Restaurant[];
  initialAuditLog: AuditLogEntry[];
}) {
  const [restaurants, setRestaurants] = useState(initialRestaurants);
  const [auditLog, setAuditLog] = useState(initialAuditLog);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function refreshAuditLog() {
    try {
      const { entries } = await listAuditLog();
      setAuditLog(entries);
    } catch {
      // Non-critical — the restaurant list itself already updated.
    }
  }

  async function handleSuspend(restaurant: Restaurant) {
    const reason = window.prompt(`Reason for suspending "${restaurant.name}" (optional):`) ?? undefined;
    setPendingId(restaurant.id);
    setError(null);
    try {
      const { restaurant: updated } = await suspendRestaurant(restaurant.id, reason || undefined);
      setRestaurants((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      await refreshAuditLog();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to suspend restaurant");
    } finally {
      setPendingId(null);
    }
  }

  async function handleUnsuspend(restaurant: Restaurant) {
    setPendingId(restaurant.id);
    setError(null);
    try {
      const { restaurant: updated } = await unsuspendRestaurant(restaurant.id);
      setRestaurants((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      await refreshAuditLog();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unsuspend restaurant");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
          Platform overview — {restaurants.length} restaurant{restaurants.length === 1 ? "" : "s"}
        </h2>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead>
              <tr className="border-b border-black/[.08] text-zinc-500 dark:border-white/[.145] dark:text-zinc-400">
                <th className="py-1.5 pr-4 font-medium">Restaurant</th>
                <th className="py-1.5 pr-4 font-medium">Address</th>
                <th className="py-1.5 pr-4 font-medium">Status</th>
                <th className="py-1.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {restaurants.map((restaurant) => (
                <tr key={restaurant.id} className="border-b border-black/[.04] dark:border-white/[.08]">
                  <td className="py-1.5 pr-4 text-black dark:text-zinc-50">{restaurant.name}</td>
                  <td className="py-1.5 pr-4 text-zinc-600 dark:text-zinc-400">{restaurant.address ?? "—"}</td>
                  <td className="py-1.5 pr-4">
                    {restaurant.isSuspended ? (
                      <span className="text-red-600 dark:text-red-400">
                        Suspended{restaurant.suspendedReason ? ` — ${restaurant.suspendedReason}` : ""}
                      </span>
                    ) : restaurant.isPublished ? (
                      <span className="text-green-600 dark:text-green-400">Published</span>
                    ) : (
                      <span className="text-zinc-500 dark:text-zinc-400">Unpublished</span>
                    )}
                  </td>
                  <td className="py-1.5">
                    <button
                      type="button"
                      disabled={pendingId === restaurant.id}
                      onClick={() => (restaurant.isSuspended ? handleUnsuspend(restaurant) : handleSuspend(restaurant))}
                      className={`rounded-full px-3 py-1 text-xs disabled:opacity-50 ${
                        restaurant.isSuspended
                          ? "bg-foreground text-background"
                          : "border border-red-300 text-red-600"
                      }`}
                    >
                      {restaurant.isSuspended ? "Unsuspend" : "Suspend"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Admin audit log</h2>
        <div className="flex flex-col divide-y divide-black/[.04] dark:divide-white/[.08]">
          {auditLog.length === 0 && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No admin actions recorded yet.</p>
          )}
          {auditLog.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between gap-4 py-1.5 text-sm">
              <span className="text-zinc-700 dark:text-zinc-300">
                {entry.adminName} {formatAction(entry.action)} {entry.targetType.toLowerCase()} {entry.targetId}
              </span>
              <span className="shrink-0 text-xs text-zinc-500">{new Date(entry.createdAt).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
