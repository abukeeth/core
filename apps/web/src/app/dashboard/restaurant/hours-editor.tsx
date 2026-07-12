"use client";

import { useState } from "react";
import { setRestaurantHours, type HoursDayOfWeek, type HoursRowInput } from "@/lib/api";

const DAYS: { key: HoursDayOfWeek; label: string }[] = [
  { key: "MONDAY", label: "Monday" },
  { key: "TUESDAY", label: "Tuesday" },
  { key: "WEDNESDAY", label: "Wednesday" },
  { key: "THURSDAY", label: "Thursday" },
  { key: "FRIDAY", label: "Friday" },
  { key: "SATURDAY", label: "Saturday" },
  { key: "SUNDAY", label: "Sunday" },
];

function minutesToTimeInput(minutes: number): string {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function timeInputToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

type DayState = { opensAt: number; closesAt: number; isClosed: boolean };

function buildInitialState(rows: HoursRowInput[]): Record<HoursDayOfWeek, DayState> {
  const state = Object.fromEntries(
    DAYS.map((d) => [d.key, { opensAt: 9 * 60, closesAt: 21 * 60, isClosed: true }]),
  ) as Record<HoursDayOfWeek, DayState>;
  for (const row of rows) {
    state[row.dayOfWeek] = { opensAt: row.opensAt, closesAt: row.closesAt, isClosed: row.isClosed };
  }
  return state;
}

export function HoursEditor({ initialHours }: { initialHours: HoursRowInput[] }) {
  const [days, setDays] = useState<Record<HoursDayOfWeek, DayState>>(() => buildInitialState(initialHours));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function updateDay(key: HoursDayOfWeek, patch: Partial<DayState>) {
    setDays((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const hours: HoursRowInput[] = DAYS.map((d) => ({ dayOfWeek: d.key, ...days[d.key] }));
      const { hours: saved } = await setRestaurantHours(hours);
      setDays(buildInitialState(saved));
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save hours");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-black/[.08] bg-white p-8 dark:border-white/[.145] dark:bg-zinc-950">
      <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Operating hours</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Customers can only place an order while your restaurant is open according to this schedule.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-col divide-y divide-black/[.08] dark:divide-white/[.145]">
        {DAYS.map((d) => {
          const state = days[d.key];
          return (
            <div key={d.key} className="flex flex-wrap items-center gap-3 py-3 text-sm">
              <span className="w-24 font-medium text-black dark:text-zinc-50">{d.label}</span>
              <label className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={state.isClosed}
                  onChange={(e) => updateDay(d.key, { isClosed: e.target.checked })}
                />
                Closed
              </label>
              {!state.isClosed && (
                <>
                  <input
                    type="time"
                    value={minutesToTimeInput(state.opensAt)}
                    onChange={(e) => updateDay(d.key, { opensAt: timeInputToMinutes(e.target.value) })}
                    className="rounded border border-black/[.08] px-2 py-1 dark:border-white/[.145] dark:bg-black"
                  />
                  <span className="text-zinc-500 dark:text-zinc-400">to</span>
                  <input
                    type="time"
                    value={minutesToTimeInput(state.closesAt)}
                    onChange={(e) => updateDay(d.key, { closesAt: timeInputToMinutes(e.target.value) })}
                    className="rounded border border-black/[.08] px-2 py-1 dark:border-white/[.145] dark:bg-black"
                  />
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-full bg-foreground px-5 py-2 text-sm text-background disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save hours"}
        </button>
        {savedAt && <span className="text-sm text-green-600 dark:text-green-400">Saved</span>}
      </div>
    </div>
  );
}
