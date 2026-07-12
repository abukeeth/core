"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/ui";
import {
  listMyDriverAssignments,
  postLocationPing,
  respondToAssignment,
  updateFulfillmentStatus,
  type DriverAssignment,
} from "@/lib/staff-commerce-api";

function formatPrice(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Staff-facing driver view (Sprint 07 §22) — assigned deliveries, accept/decline, mark picked up/delivered, periodic location ping. */
export default function DriverPage() {
  const [assignments, setAssignments] = useState<DriverAssignment[]>([]);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    return listMyDriverAssignments()
      .then((result) => setAssignments(result.assignments))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load deliveries"));
  }

  useEffect(() => {
    let cancelled = false;
    listMyDriverAssignments()
      .then((result) => {
        if (!cancelled) setAssignments(result.assignments);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load deliveries");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const enRoute = assignments.find((a) => a.status === "EN_ROUTE");
    if (!enRoute?.fulfillmentId || typeof navigator === "undefined" || !navigator.geolocation) return;

    const interval = setInterval(() => {
      navigator.geolocation.getCurrentPosition((position) => {
        postLocationPing(enRoute.fulfillmentId, position.coords.latitude, position.coords.longitude).catch(() => undefined);
      });
    }, 30_000);

    return () => clearInterval(interval);
  }, [assignments]);

  async function handleRespond(id: string, accept: boolean) {
    try {
      await respondToAssignment(id, accept);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to respond");
    }
  }

  async function handleStatus(fulfillmentId: string, status: string) {
    try {
      await updateFulfillmentStatus(fulfillmentId, status);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    }
  }

  return (
    <PageShell maxWidth="xl">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-black dark:text-zinc-50">My deliveries</h1>
          <button type="button" onClick={refresh} className="text-sm text-zinc-600 dark:text-zinc-400">
            Refresh
          </button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <ul className="flex flex-col gap-3">
          {assignments.map((assignment) => (
            <li key={assignment.id} className="flex flex-col gap-2 rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-950">
              <div className="flex items-center justify-between">
                <span className="font-medium text-black dark:text-zinc-50">
                  {assignment.fulfillment ? `Order #${assignment.fulfillment.order.orderNumber}` : "Delivery"}
                </span>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  {assignment.status}
                </span>
              </div>
              {assignment.fulfillment && (
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  ${formatPrice(assignment.fulfillment.order.totalCents)}
                </span>
              )}

              {assignment.status === "OFFERED" && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleRespond(assignment.id, true)}
                    className="rounded-full bg-foreground px-4 py-2 text-sm text-background"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRespond(assignment.id, false)}
                    className="rounded-full border border-red-300 px-4 py-2 text-sm text-red-600"
                  >
                    Decline
                  </button>
                </div>
              )}

              {assignment.status === "ACCEPTED" && (
                <button
                  type="button"
                  onClick={() => handleStatus(assignment.fulfillmentId, "PICKED_UP")}
                  className="self-start rounded-full bg-foreground px-4 py-2 text-sm text-background"
                >
                  Mark picked up
                </button>
              )}

              {(assignment.status === "ACCEPTED" || assignment.status === "EN_ROUTE") && (
                <button
                  type="button"
                  onClick={() => handleStatus(assignment.fulfillmentId, "DELIVERED")}
                  className="self-start rounded-full border border-black/[.08] px-4 py-2 text-sm dark:border-white/[.145]"
                >
                  Mark delivered
                </button>
              )}
            </li>
          ))}
          {assignments.length === 0 && <p className="text-sm text-zinc-500">No deliveries assigned to you right now.</p>}
        </ul>
    </PageShell>
  );
}
