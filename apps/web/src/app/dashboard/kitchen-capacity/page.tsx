"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/ui";
import { getKitchenCapacity, updateKitchenCapacity, type KitchenCapacity } from "@/lib/owner-commerce-api";

export default function KitchenCapacityPage() {
  const [capacity, setCapacity] = useState<KitchenCapacity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getKitchenCapacity()
      .then((result) => {
        if (!cancelled) setCapacity(result.kitchenCapacity);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load kitchen capacity");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleTogglePause() {
    if (!capacity) return;
    try {
      const { kitchenCapacity } = await updateKitchenCapacity({ isAcceptingOrders: !capacity.isAcceptingOrders });
      setCapacity(kitchenCapacity);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    }
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!capacity) return;
    setSaving(true);
    try {
      const { kitchenCapacity } = await updateKitchenCapacity(capacity);
      setCapacity(kitchenCapacity);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (!capacity) {
    return (
      <PageShell maxWidth="xl">
        <p className="text-sm text-[#756B5D]">{error ?? "Loading…"}</p>
      </PageShell>
    );
  }

  return (
    <PageShell maxWidth="xl">
      <form onSubmit={handleSave} className="flex w-full flex-col gap-6">
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Kitchen capacity</h1>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center justify-between rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-950">
          <span className="text-sm font-medium">
            {capacity.isAcceptingOrders ? "Accepting new orders" : "Paused — not accepting new orders"}
          </span>
          <button
            type="button"
            onClick={handleTogglePause}
            className={`rounded-full px-4 py-2 text-sm ${
              capacity.isAcceptingOrders ? "border border-red-300 text-red-600" : "bg-foreground text-background"
            }`}
          >
            {capacity.isAcceptingOrders ? "Pause kitchen" : "Resume kitchen"}
          </button>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-950">
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            Max concurrent orders (auto-pause threshold)
            <input
              type="number"
              value={capacity.maxConcurrentOrders ?? ""}
              onChange={(e) => setCapacity({ ...capacity, maxConcurrentOrders: e.target.value ? Number(e.target.value) : null })}
              className="rounded border border-black/[.08] px-3 py-2 dark:border-white/[.145] dark:bg-black"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            Average prep time (minutes)
            <input
              type="number"
              value={capacity.avgPrepTimeMinutes ?? ""}
              onChange={(e) => setCapacity({ ...capacity, avgPrepTimeMinutes: e.target.value ? Number(e.target.value) : null })}
              className="rounded border border-black/[.08] px-3 py-2 dark:border-white/[.145] dark:bg-black"
            />
          </label>
        </div>

        <button type="submit" disabled={saving} className="self-start rounded-full bg-foreground px-5 py-2 text-sm text-background disabled:opacity-50">
          {saving ? "Saving…" : "Save"}
        </button>
      </form>
    </PageShell>
  );
}
