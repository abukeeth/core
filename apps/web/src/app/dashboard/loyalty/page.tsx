"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/ui";
import { getLoyaltyProgram, updateLoyaltyProgram, type LoyaltyProgram } from "@/lib/owner-commerce-api";

export default function LoyaltyPage() {
  const [program, setProgram] = useState<LoyaltyProgram | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getLoyaltyProgram()
      .then((result) => {
        if (!cancelled) setProgram(result.program);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load loyalty program");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleToggleActive() {
    if (!program) return;
    try {
      const { program: updated } = await updateLoyaltyProgram({ isActive: !program.isActive });
      setProgram(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    }
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!program) return;
    setSaving(true);
    try {
      const { program: updated } = await updateLoyaltyProgram({
        pointsPerDollarCents: program.pointsPerDollarCents,
        redemptionRateCentsPerPoint: program.redemptionRateCentsPerPoint,
      });
      setProgram(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (!program) {
    return (
      <PageShell maxWidth="xl">
        <p className="text-sm text-[#756B5D]">{error ?? "Loading…"}</p>
      </PageShell>
    );
  }

  const exampleDollars = 20;
  const examplePoints = exampleDollars * program.pointsPerDollarCents;

  return (
    <PageShell maxWidth="xl">
      <form onSubmit={handleSave} className="flex w-full flex-col gap-6">
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Loyalty program</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Reward customers with points on completed orders, redeemable for a discount on a future order.
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center justify-between rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-950">
          <span className="text-sm font-medium">{program.isActive ? "Active" : "Inactive"}</span>
          <button
            type="button"
            onClick={handleToggleActive}
            className={`rounded-full px-4 py-2 text-sm ${
              program.isActive ? "border border-red-300 text-red-600" : "bg-foreground text-background"
            }`}
          >
            {program.isActive ? "Turn off" : "Turn on"}
          </button>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-950">
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            Points earned per $1 spent (subtotal, before tax/tip)
            <input
              type="number"
              min="0"
              value={program.pointsPerDollarCents}
              onChange={(e) => setProgram({ ...program, pointsPerDollarCents: Number(e.target.value) })}
              className="rounded border border-black/[.08] px-3 py-2 dark:border-white/[.145] dark:bg-black"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            Discount cents per point redeemed
            <input
              type="number"
              min="0"
              value={program.redemptionRateCentsPerPoint}
              onChange={(e) => setProgram({ ...program, redemptionRateCentsPerPoint: Number(e.target.value) })}
              className="rounded border border-black/[.08] px-3 py-2 dark:border-white/[.145] dark:bg-black"
            />
          </label>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Example: a ${exampleDollars} order earns {examplePoints} points. 100 redeemed points would then be worth $
            {((100 * program.redemptionRateCentsPerPoint) / 100).toFixed(2)} off a future order.
          </p>
        </div>

        <button type="submit" disabled={saving} className="self-start rounded-full bg-foreground px-5 py-2 text-sm text-background disabled:opacity-50">
          {saving ? "Saving…" : "Save"}
        </button>
      </form>
    </PageShell>
  );
}
