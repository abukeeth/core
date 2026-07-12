"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/ui";
import { getDeliveryConfig, updateDeliveryConfig, type DeliveryConfig } from "@/lib/owner-commerce-api";

export default function DeliveryPage() {
  const [config, setConfig] = useState<DeliveryConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getDeliveryConfig()
      .then((result) => {
        if (!cancelled) setConfig(result.deliveryConfig);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load delivery settings");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!config) return;
    setSaving(true);
    try {
      const { deliveryConfig } = await updateDeliveryConfig(config);
      setConfig(deliveryConfig);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (!config) {
    return (
      <PageShell maxWidth="xl">
        <p className="text-sm text-[#756B5D]">{error ?? "Loading…"}</p>
      </PageShell>
    );
  }

  return (
    <PageShell maxWidth="xl">
      <form onSubmit={handleSave} className="flex w-full flex-col gap-6">
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Delivery &amp; fulfillment</h1>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-col gap-3 rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-950">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.isDeliveryEnabled}
              onChange={(e) => setConfig({ ...config, isDeliveryEnabled: e.target.checked })}
            />
            Delivery enabled
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.isPickupEnabled}
              onChange={(e) => setConfig({ ...config, isPickupEnabled: e.target.checked })}
            />
            Pickup enabled
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.isDineInEnabled}
              onChange={(e) => setConfig({ ...config, isDineInEnabled: e.target.checked })}
            />
            Dine-in (QR) enabled
          </label>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-950">
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            Delivery radius (miles)
            <input
              type="number"
              step="0.1"
              value={config.deliveryRadiusMiles ?? ""}
              onChange={(e) => setConfig({ ...config, deliveryRadiusMiles: e.target.value ? Number(e.target.value) : null })}
              className="rounded border border-black/[.08] px-3 py-2 dark:border-white/[.145] dark:bg-black"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            Max delivery distance (miles)
            <input
              type="number"
              step="0.1"
              value={config.maxDeliveryDistanceMiles ?? ""}
              onChange={(e) => setConfig({ ...config, maxDeliveryDistanceMiles: e.target.value ? Number(e.target.value) : null })}
              className="rounded border border-black/[.08] px-3 py-2 dark:border-white/[.145] dark:bg-black"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            Minimum order for delivery ($)
            <input
              type="number"
              step="0.01"
              value={config.minOrderCentsForDelivery / 100}
              onChange={(e) => setConfig({ ...config, minOrderCentsForDelivery: Math.round(Number(e.target.value) * 100) })}
              className="rounded border border-black/[.08] px-3 py-2 dark:border-white/[.145] dark:bg-black"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            Minimum order for pickup ($)
            <input
              type="number"
              step="0.01"
              value={config.minOrderCentsForPickup / 100}
              onChange={(e) => setConfig({ ...config, minOrderCentsForPickup: Math.round(Number(e.target.value) * 100) })}
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
