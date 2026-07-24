"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PageShell } from "@/components/ui";
import { completeOrder, listOwnOrders, markOutForDelivery, markReady, startPreparing, type OwnerOrder } from "@/lib/owner-commerce-api";
import { detectNewOrderIds, formatElapsed, getElapsedSeverity } from "@/lib/kitchen-display";

const QUEUE_STATUSES = ["CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY"];
// Real-time updates arrive over the SSE stream; this poll is only a safety net
// for a dropped/reconnecting stream or a multi-instance deployment where an
// event was emitted on another API process — hence a slower cadence than the
// old poll-only 15s.
const FALLBACK_REFRESH_MS = 30_000;
const SOUND_PREFERENCE_KEY = "ordervora-kitchen-sound-enabled";
// Last-known queue, persisted so a reload or a network blip shows the orders
// that were on screen instead of a blank/error state. Dynamic order data is
// intentionally only cached here (never by the service worker), so a stale
// snapshot can't be served as if it were live.
const QUEUE_CACHE_KEY = "ordervora-kitchen-queue-cache";

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
    // Strong, attention-grabbing triple beep: a square wave carries over
    // kitchen ambient noise far better than a single soft sine, and three
    // rising pulses read unmistakably as "new order" rather than an incidental
    // UI blip.
    const beepAt = (offsetSeconds: number, frequency: number) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "square";
      oscillator.frequency.value = frequency;
      const start = ctx.currentTime + offsetSeconds;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.32, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.24);
    };
    beepAt(0, 784);
    beepAt(0.28, 988);
    beepAt(0.56, 1175);
    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 1000);
  } catch {
    // Audio isn't essential to kitchen operation — the visual queue, the
    // new-order flash, and the timers still work without it (e.g.
    // autoplay-restricted browsers).
  }
}

const FLASH_MS = 6_000;

/** Staff-facing kitchen queue (Sprint 07 §22; Sprint 16 timers/sound/auto-refresh) — the same order data as /dashboard/orders, filtered to active kitchen work, with one-tap status advances, dine-in table labels, per-order elapsed timers, a new-order sound alert, and periodic auto-refresh. */
export default function KitchenQueuePage() {
  const [orders, setOrders] = useState<OwnerOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [soundEnabled, setSoundEnabled] = useState(
    () => typeof window === "undefined" || window.localStorage.getItem(SOUND_PREFERENCE_KEY) !== "false",
  );
  const [flashingIds, setFlashingIds] = useState<Set<string>>(() => new Set());
  const [isOffline, setIsOffline] = useState(false);
  const seenOrderIdsRef = useRef<Set<string>>(new Set());
  const flashTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

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
        if (newOrderIds.length > 0) {
          if (soundEnabled) playAlertBeep();
          // Flash the new cards for a few seconds so a glance at the screen —
          // not just the sound — announces the order.
          setFlashingIds((prev) => {
            const next = new Set(prev);
            for (const id of newOrderIds) next.add(id);
            return next;
          });
          for (const id of newOrderIds) {
            clearTimeout(flashTimeoutsRef.current.get(id));
            const timeout = setTimeout(() => {
              flashTimeoutsRef.current.delete(id);
              setFlashingIds((prev) => {
                if (!prev.has(id)) return prev;
                const next = new Set(prev);
                next.delete(id);
                return next;
              });
            }, FLASH_MS);
            flashTimeoutsRef.current.set(id, timeout);
          }
        }
        seenOrderIdsRef.current = new Set(all.map((o) => o.id));

        setOrders(all);
        setError(null);
        try {
          window.localStorage.setItem(QUEUE_CACHE_KEY, JSON.stringify(all));
        } catch {
          // Cache is a nicety; a full/blocked localStorage must not break the queue.
        }
      })
      .catch((err) => {
        // Offline is expected and handled by the banner + cached queue — don't
        // surface it as a scary error. Only report genuine (online) failures.
        if (typeof navigator === "undefined" || navigator.onLine) {
          setError(err instanceof Error ? err.message : "Failed to load queue");
        }
      });
  }, [soundEnabled]);

  // Hold the latest refresh so the SSE connection can stay open for the whole
  // mount without reconnecting every time `refresh` is recreated (e.g. on a
  // sound-toggle).
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  // Hydrate the last-known queue from cache on mount (post-render, so it never
  // causes an SSR hydration mismatch). Seed the seen-order set from it too, so
  // cached orders don't re-flash on reload — only orders that arrived since the
  // last cached view do. Runs before the first fetch resolves.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(QUEUE_CACHE_KEY);
      if (!raw) return;
      const cached = JSON.parse(raw) as OwnerOrder[];
      if (Array.isArray(cached) && cached.length > 0) {
        seenOrderIdsRef.current = new Set(cached.map((o) => o.id));
        // One-shot hydration from localStorage on mount — deliberately an
        // effect (not a useState initializer) so server and first client
        // render agree (no SSR hydration mismatch); localStorage only exists
        // on the client.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOrders(cached);
      }
    } catch {
      // Corrupt/blocked cache — ignore and fall back to a live fetch.
    }
  }, []);

  // Connection awareness: show the offline banner and, on reconnect, refetch
  // immediately (the SSE stream also auto-reconnects on its own).
  useEffect(() => {
    const sync = () => setIsOffline(typeof navigator !== "undefined" && !navigator.onLine);
    const handleOnline = () => {
      sync();
      void refreshRef.current();
    };
    sync();
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", sync);
    };
  }, []);

  useEffect(() => {
    refresh();
    const pollInterval = setInterval(refresh, FALLBACK_REFRESH_MS);
    const tickInterval = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(pollInterval);
      clearInterval(tickInterval);
    };
  }, [refresh]);

  // Real-time transport: refetch the instant the server signals order activity
  // for this restaurant. EventSource auto-reconnects on drop; transient errors
  // need no handling because the fallback poll above covers any gap.
  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;
    const source = new EventSource("/api/restaurants/me/orders/stream", { withCredentials: true });
    source.addEventListener("order", () => {
      void refreshRef.current();
    });
    return () => source.close();
  }, []);

  // Cancel any pending flash timers on unmount.
  useEffect(() => {
    const timeouts = flashTimeoutsRef.current;
    return () => {
      for (const timeout of timeouts.values()) clearTimeout(timeout);
      timeouts.clear();
    };
  }, []);

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

        {isOffline && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
          >
            <span aria-hidden>⚠️</span>
            Offline — showing the last known queue. Updates resume automatically when the connection returns.
          </div>
        )}

        {error && !isOffline && <p className="text-sm text-red-600">{error}</p>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {orders.map((order) => {
            const actions = NEXT_ACTIONS[order.status] ?? [];
            const severity = getElapsedSeverity(order.placedAt, now);
            const isNew = flashingIds.has(order.id);
            return (
              <div
                key={order.id}
                aria-live={isNew ? "polite" : undefined}
                className={`flex flex-col gap-2 rounded-lg border bg-white p-4 dark:bg-zinc-950 ${
                  isNew
                    ? "animate-pulse border-amber-400 ring-2 ring-amber-400 dark:border-amber-400"
                    : "border-black/[.08] dark:border-white/[.145]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-black dark:text-zinc-50">
                    {isNew && <span className="mr-1 text-amber-500">●</span>}#{order.orderNumber} {order.tableId && <span className="text-xs text-zinc-500">(table)</span>}
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
