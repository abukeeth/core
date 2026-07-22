"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/owner-shell";
import { Icon } from "@/components/owner-icons";
import { getLoyaltyProgram, updateLoyaltyProgram, type LoyaltyProgram } from "@/lib/owner-commerce-api";

/* Loyalty & rewards — Figma "Owner Dashboard V3 / Loyalty & Rewards" (node
 * 49:14). Only the loyalty *program* (earn rate, redemption rate, on/off) is
 * backed by an API, so that is what's shown and editable here. The mock's
 * member/points stats, rewards catalog, VIP tiers and redemption feed have no
 * backing data or endpoints and are omitted rather than fabricated — they are
 * a follow-up that needs loyalty-account aggregation. All existing settings
 * behaviour (toggle + edit + save) is preserved. */

const FIELD = "w-full rounded-[12px] border border-line bg-surface px-3.5 py-3 text-sm text-ink outline-none focus:border-brand";

export default function LoyaltyPage() {
  const [program, setProgram] = useState<LoyaltyProgram | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getLoyaltyProgram()
      .then((r) => { if (!cancelled) setProgram(r.program); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load loyalty program"); });
    return () => { cancelled = true; };
  }, []);

  async function toggleActive() {
    if (!program) return;
    try {
      const { program: updated } = await updateLoyaltyProgram({ isActive: !program.isActive });
      setProgram(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    }
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!program) return;
    setSaving(true);
    setSaved(false);
    try {
      const { program: updated } = await updateLoyaltyProgram({
        pointsPerDollarCents: program.pointsPerDollarCents,
        redemptionRateCentsPerPoint: program.redemptionRateCentsPerPoint,
      });
      setProgram(updated);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardShell active="/dashboard/loyalty">
      <div>
        <h1 className="font-display text-[28px] font-semibold leading-[34px] tracking-[-0.3px]">Loyalty &amp; rewards</h1>
        <p className="mt-0.5 text-xs text-ink-muted">Reward repeat customers and grow retention</p>
      </div>

      {error && <div className="mt-4 rounded-[18px] border border-danger/25 bg-danger/5 px-4 py-3 text-sm font-medium text-danger">{error}</div>}
      {!program && !error && <div className="mt-4 h-24 animate-pulse rounded-[18px] border border-line bg-surface" />}

      {program && (
        <form onSubmit={handleSave} className="mt-4 space-y-4">
          {/* Program status */}
          <div className="flex items-center gap-3 rounded-[18px] border border-line bg-surface px-4 py-3.5">
            <span className="flex size-[42px] shrink-0 items-center justify-center rounded-[13px] bg-brand-soft text-brand">
              <Icon name="sparkles" className="h-[21px] w-[21px]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-[17px] font-medium leading-[23px] text-ink">Loyalty program</p>
              <p className="text-xs text-ink-secondary">{program.isActive ? "Live — customers earn points on completed orders" : "Off — customers are not earning points"}</p>
            </div>
            <button type="button" role="switch" aria-checked={program.isActive} aria-label="Toggle loyalty program"
              onClick={toggleActive}
              className={`relative h-[28px] w-[50px] shrink-0 rounded-full transition-colors ${program.isActive ? "bg-success" : "bg-line"}`}>
              <span className={`absolute top-[3px] size-[22px] rounded-full bg-white shadow-sm transition-all ${program.isActive ? "left-[25px]" : "left-[3px]"}`} />
            </button>
          </div>

          {/* Earn rule */}
          <div className="rounded-[18px] border border-line bg-surface p-4">
            <p className="font-display text-[17px] font-medium text-ink">
              {program.pointsPerDollarCents} point{program.pointsPerDollarCents === 1 ? "" : "s"} for every $1 spent
            </p>
            <p className="mt-0.5 text-xs text-ink-secondary">Points are added after an order is completed (on subtotal, before tax and tip).</p>
            <label className="mt-3 block">
              <span className="text-sm font-semibold text-ink">Points earned per $1</span>
              <input type="number" min="0" value={program.pointsPerDollarCents}
                onChange={(e) => setProgram({ ...program, pointsPerDollarCents: Number(e.target.value) })} className={`mt-1.5 ${FIELD}`} />
            </label>
          </div>

          {/* Redemption */}
          <div className="rounded-[18px] border border-line bg-surface p-4">
            <p className="font-display text-[17px] font-medium text-ink">Redemption value</p>
            <p className="mt-0.5 text-xs text-ink-secondary">
              100 points ={" "}
              {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((100 * program.redemptionRateCentsPerPoint) / 100)} off a future order.
            </p>
            <label className="mt-3 block">
              <span className="text-sm font-semibold text-ink">Discount cents per point</span>
              <input type="number" min="0" value={program.redemptionRateCentsPerPoint}
                onChange={(e) => setProgram({ ...program, redemptionRateCentsPerPoint: Number(e.target.value) })} className={`mt-1.5 ${FIELD}`} />
            </label>
          </div>

          {saved && <div className="rounded-[14px] border border-success/25 bg-success/5 px-4 py-3 text-sm font-medium text-success">Loyalty program saved.</div>}

          <button type="submit" disabled={saving} className="w-full rounded-[16px] bg-brand px-4 py-3.5 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "Saving…" : "Save changes"}
          </button>
        </form>
      )}
    </DashboardShell>
  );
}
