"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PageShell } from "@/components/ui";
import { completeOrder, listOwnOrders, markOutForDelivery, markReady, startPreparing, type OwnerOrder } from "@/lib/owner-commerce-api";
import { detectNewOrderIds, formatElapsed, getElapsedSeverity } from "@/lib/kitchen-display";

const QUEUE_STATUSES = ["CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY"];
const AUTO_REFRESH_MS = 15_000;
const SOUND_PREFERENCE_KEY = "ordervora-kitchen-sound-enabled";

const SEVERITY_CLASSES: Record<string, string> = {
  normal: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  critical: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

// Mirrors dashboard/orders/[id]/page.tsx's (correct) NEXT_ACTIONS — the
// order state machine (order-state-machine.ts) only allows
// READY -> COMPLETED (never READY -> OUT_FOR_DELIVERY), so a fixed
// per-status action here was a dead end: every order that reached READY
// showed a "Mark out for delivery" button that could never succeed,
// regardless of fulfillment type. PREPARING now offers both real next
// steps (mark-ready for pickup/dine-in, mark-out-for-delivery for
// delivery, matching the state machine's PREPARING -> READY |
// OUT_FOR_DELIVERY), and READY/OUT_FOR_DELIVERY both offer "Complete".
const NEXT_ACTIONS: Record<string, { label: string; action: (id: string) => Promise<unknown> }[]> = {
  CONFIRMED: [{ label: "Start preparing", action: startPreparing }],
  PREPARING: [
    { label: "Mark ready", action: markReady },
    { label: "Mark out for delivery", action: markOutForDelivery },
  ],
  READY: [{ label: "Complete", action: completeOrder }],
  OUT_FOR_DELIVERY: [{ label: "Complete", action: completeOrder }],
};

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

        const newOrderIds = detectNewOrderIds(
          seenOrderIdsRef.current,
          all.map((o) => o.id),
        );
        if (newOrderIds.length > 0 && soundEnabled) {
          playAlertBeep();
        }
        seenOrderIdsRef.current = new Set(all.map((o) => o.id));

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
            const actions = NEXT_ACTIONS[order.status] ?? [];
            const severity = getElapsedSeverity(order.placedAt, now);
            return (
              <div key={order.id} className="flex flex-col gap-2 rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-950">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-black dark:text-zinc-50">
                    #{order.orderNumber} {order.tableId && <span className="text-xs text-zinc-500">(table)</span>}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_CLASSES[severity]}`}>
                    {formatElapsed(order.placedAt, now)}
                  </span>
                </div>
                <span className="text-xs text-zinc-500">
                  {order.status} · {order.fulfillmentType} · {order.source}
                </span>
                <div className="flex flex-wrap gap-2">
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
                </div>
              </div>
            );
          })}
          {orders.length === 0 && <p className="text-sm text-zinc-500">No active orders.</p>}
        </div>
    </PageShell>
  );
}
