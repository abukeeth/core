"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PageShell } from "@/components/ui";
import {
  cancelOrder,
  completeOrder,
  listOwnOrders,
  markOutForDelivery,
  markReady,
  orderCustomerRef,
  orderLineModifiers,
  paymentMethodLabel,
  startPreparing,
  type OwnerOrder,
} from "@/lib/owner-commerce-api";
import { detectNewOrderIds, formatElapsed, getElapsedSeverity } from "@/lib/kitchen-display";

const QUEUE_STATUSES = ["CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY"];
const AUTO_REFRESH_MS = 15_000;
const SOUND_PREFERENCE_KEY = "ordervora-kitchen-sound-enabled";

const SEVERITY_CLASSES: Record<string, string> = {
  normal: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  critical: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

function isDeliveryOrder(fulfillmentType: string): boolean {
  return fulfillmentType.toUpperCase().includes("DELIVER");
}

// Next action(s) for a status, CORRECT for the order's fulfillment type. The
// state machine only allows PREPARING -> READY (pickup/dine-in) or PREPARING ->
// OUT_FOR_DELIVERY (delivery), and READY only completes. Showing both to every
// order previously let a pickup order be pushed to OUT_FOR_DELIVERY. A delivery
// order now sees only "Mark out for delivery"; pickup/dine-in only "Mark ready".
function nextActionsFor(
  status: string,
  fulfillmentType: string,
): { label: string; action: (id: string) => Promise<unknown> }[] {
  switch (status) {
    case "CONFIRMED":
      return [{ label: "Start preparing", action: startPreparing }];
    case "PREPARING":
      return isDeliveryOrder(fulfillmentType)
        ? [{ label: "Mark out for delivery", action: markOutForDelivery }]
        : [{ label: "Mark ready", action: markReady }];
    case "READY":
    case "OUT_FOR_DELIVERY":
      return [{ label: "Complete", action: completeOrder }];
    default:
      return [];
  }
}

function playAlertBeep(): void {
  try {
    const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const ctx = new AudioContextCtor();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.4);
    oscillator.onended = () => ctx.close();
  } catch {
    // Audio isn't essential to kitchen operation — the visual queue and
    // timers still work without it (e.g. autoplay-restricted browsers).
  }
}

/** Staff-facing kitchen queue (Sprint 07 §22; Sprint 16 timers/sound/auto-refresh) — the same order data as /dashboard/orders, filtered to active kitchen work, with one-tap status advances, dine-in table labels, per-order elapsed timers, a new-order sound alert, and periodic auto-refresh. */
export default function KitchenQueuePage() {
  const [orders, setOrders] = useState<OwnerOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [soundEnabled, setSoundEnabled] = useState(
    () => typeof window === "undefined" || window.localStorage.getItem(SOUND_PREFERENCE_KEY) !== "false",
  );
  // IDs detected as new on the latest poll — drives the visual "NEW" highlight
  // (the same signal that fires the sound), cleared on the next refresh cycle.
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set());
  const seenOrderIdsRef = useRef<Set<string>>(new Set());

  function toggleSound() {
    setSoundEnabled((prev) => {
      const next = !prev;
      window.localStorage.setItem(SOUND_PREFERENCE_KEY, String(next));
      return next;
    });
  }

  const refresh = useCallback(() => {
    return Promise.all(QUEUE_STATUSES.map((status) => listOwnOrders({ status })))
      .then((results) => {
        const all = results.flatMap((r) => r.orders);
        all.sort((a, b) => new Date(a.placedAt).getTime() - new Date(b.placedAt).getTime());

        const detected = detectNewOrderIds(
          seenOrderIdsRef.current,
          all.map((o) => o.id),
        );
        if (detected.length > 0 && soundEnabled) {
          playAlertBeep();
        }
        seenOrderIdsRef.current = new Set(all.map((o) => o.id));

        setNewOrderIds(new Set(detected));
        setOrders(all);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load queue"));
  }, [soundEnabled]);

  useEffect(() => {
    refresh();
    const pollInterval = setInterval(refresh, AUTO_REFRESH_MS);
    const tickInterval = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(pollInterval);
      clearInterval(tickInterval);
    };
  }, [refresh]);

  async function handleAdvance(order: OwnerOrder, action: (id: string) => Promise<unknown>) {
    try {
      await action(order.id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  }

  async function handleReject(order: OwnerOrder) {
    if (typeof window !== "undefined" && !window.confirm(`Reject order #${order.orderNumber}? This cancels it.`)) return;
    try {
      await cancelOrder(order.id, "Rejected by kitchen");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reject the order");
    }
  }

  return (
    <PageShell maxWidth="3xl">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Kitchen queue</h1>
          <div className="flex items-center gap-3">
            <button type="button" onClick={toggleSound} className="text-sm text-zinc-600 dark:text-zinc-400">
              {soundEnabled ? "🔔 Sound on" : "🔕 Sound off"}
            </button>
            <button type="button" onClick={refresh} className="text-sm text-zinc-600 dark:text-zinc-400">
              Refresh
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {orders.map((order) => {
            const actions = nextActionsFor(order.status, order.fulfillmentType);
            const severity = getElapsedSeverity(order.placedAt, now);
            const isNew = newOrderIds.has(order.id);
            const customer = orderCustomerRef(order);
            return (
              <div
                key={order.id}
                className={`flex flex-col gap-2 rounded-lg border bg-white p-4 dark:bg-zinc-950 ${
                  isNew ? "border-amber-400 ring-2 ring-amber-300 dark:border-amber-500" : "border-black/[.08] dark:border-white/[.145]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-medium text-black dark:text-zinc-50">
                    #{order.orderNumber} {order.tableId && <span className="text-xs text-zinc-500">(table)</span>}
                    {isNew && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">New</span>}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_CLASSES[severity]}`}>
                    {formatElapsed(order.placedAt, now)}
                  </span>
                </div>

                <span className="text-xs text-zinc-500">
                  {order.status} · {order.fulfillmentType} · {paymentMethodLabel(order)}
                </span>
                {customer && (
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">
                    {customer.name}
                    {customer.phone && <a href={`tel:${customer.phone}`} className="ml-2 text-brand">{customer.phone}</a>}
                  </span>
                )}

                {/* Item list — what to cook */}
                <ul className="mt-1 space-y-1 border-t border-black/[.06] pt-2 text-sm dark:border-white/[.08]">
                  {order.items.length === 0 ? (
                    <li className="text-xs text-zinc-500">No line items</li>
                  ) : (
                    order.items.map((item) => {
                      const mods = orderLineModifiers(item);
                      return (
                        <li key={item.id} className="text-black dark:text-zinc-100">
                          <span className="font-medium">{item.quantity}× {item.nameSnapshot}</span>
                          {mods.length > 0 && <span className="block pl-5 text-xs text-zinc-500">{mods.join(" · ")}</span>}
                        </li>
                      );
                    })
                  )}
                </ul>

                {order.notes && (
                  <p className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                    Note: {order.notes}
                  </p>
                )}

                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {actions.map((next) => (
                    <button
                      key={next.label}
                      type="button"
                      onClick={() => handleAdvance(order, next.action)}
                      className="self-start rounded-full bg-foreground px-4 py-2 text-sm text-background"
                    >
                      {next.label}
                    </button>
                  ))}
                  {order.status === "CONFIRMED" && (
                    <button
                      type="button"
                      onClick={() => handleReject(order)}
                      className="self-start rounded-full border border-red-300 px-4 py-2 text-sm text-red-600 dark:border-red-800 dark:text-red-400"
                    >
                      Reject
                    </button>
                  )}
                  <Link
                    href={`/dashboard/orders/${order.id}`}
                    className="self-start rounded-full border border-black/[.12] px-4 py-2 text-sm text-zinc-700 dark:border-white/[.18] dark:text-zinc-300"
                  >
                    Details
                  </Link>
                </div>
              </div>
            );
          })}
          {orders.length === 0 && <p className="text-sm text-zinc-500">No active orders.</p>}
        </div>
    </PageShell>
  );
}
