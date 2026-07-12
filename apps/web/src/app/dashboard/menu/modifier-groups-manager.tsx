"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  createModifierGroup,
  createModifierOption,
  deleteModifierGroup,
  deleteModifierOption,
  type ModifierGroup,
  type ModifierSelectionType,
} from "@/lib/api";

function formatDelta(cents: number): string {
  const dollars = (Math.abs(cents) / 100).toFixed(2);
  return cents < 0 ? `-$${dollars}` : `+$${dollars}`;
}

function ModifierGroupCard({ group, onDeleteGroup }: { group: ModifierGroup; onDeleteGroup: (id: string) => void }) {
  const router = useRouter();
  const [optionName, setOptionName] = useState("");
  const [optionPrice, setOptionPrice] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleAddOption(event: React.FormEvent) {
    event.preventDefault();
    const priceDeltaCents = Math.round(Number(optionPrice || "0") * 100);
    setBusy(true);
    try {
      await createModifierOption(group.id, { name: optionName, priceDeltaCents });
      setOptionName("");
      setOptionPrice("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteOption(optionId: string) {
    setBusy(true);
    await deleteModifierOption(group.id, optionId).finally(() => setBusy(false));
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 rounded border border-black/[.08] p-3 dark:border-white/[.145]">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-black dark:text-zinc-50">
          {group.name}{" "}
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            ({group.selectionType === "SINGLE" ? "pick one" : "pick multiple"}
            {group.isRequired ? ", required" : ""})
          </span>
        </span>
        <button type="button" onClick={() => onDeleteGroup(group.id)} className="text-xs text-red-600">
          Delete group
        </button>
      </div>
      <ul className="flex flex-col divide-y divide-black/[.06] text-sm dark:divide-white/[.08]">
        {group.options.map((option) => (
          <li key={option.id} className="flex items-center justify-between py-1">
            <span>
              {option.name}{" "}
              {option.priceDeltaCents !== 0 && <span className="text-zinc-500">({formatDelta(option.priceDeltaCents)})</span>}
            </span>
            <button type="button" onClick={() => handleDeleteOption(option.id)} disabled={busy} className="text-xs text-red-600">
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={handleAddOption} className="flex items-end gap-2">
        <input
          type="text"
          required
          placeholder="Option name"
          value={optionName}
          onChange={(e) => setOptionName(e.target.value)}
          className="flex-1 rounded border border-black/[.08] px-2 py-1 text-sm dark:border-white/[.145] dark:bg-black"
        />
        <input
          type="number"
          step="0.01"
          placeholder="+/- price"
          value={optionPrice}
          onChange={(e) => setOptionPrice(e.target.value)}
          className="w-24 rounded border border-black/[.08] px-2 py-1 text-sm dark:border-white/[.145] dark:bg-black"
        />
        <button type="submit" disabled={busy} className="rounded-full border border-black/[.08] px-3 py-1 text-xs dark:border-white/[.145]">
          Add option
        </button>
      </form>
    </div>
  );
}

export function ModifierGroupsManager({ modifierGroups }: { modifierGroups: ModifierGroup[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [selectionType, setSelectionType] = useState<ModifierSelectionType>("SINGLE");
  const [isRequired, setIsRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleCreateGroup(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await createModifierGroup({ name, selectionType, isRequired });
      setName("");
      setIsRequired(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create modifier group");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteGroup(id: string) {
    await deleteModifierGroup(id);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
      <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Modifier groups</h2>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        A modifier group (e.g. &quot;Size&quot; or &quot;Add-ons&quot;) can be attached to any menu item below.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-col gap-2">
        {modifierGroups.length === 0 && <p className="text-sm text-zinc-600 dark:text-zinc-400">No modifier groups yet.</p>}
        {modifierGroups.map((group) => (
          <ModifierGroupCard key={group.id} group={group} onDeleteGroup={handleDeleteGroup} />
        ))}
      </div>

      <form
        onSubmit={handleCreateGroup}
        className="flex flex-wrap items-end gap-2 border-t border-black/[.08] pt-4 dark:border-white/[.145]"
      >
        <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
          Group name
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Size, Add-ons"
            className="rounded border border-black/[.08] px-3 py-2 dark:border-white/[.145] dark:bg-black"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
          Type
          <select
            value={selectionType}
            onChange={(e) => setSelectionType(e.target.value as ModifierSelectionType)}
            className="rounded border border-black/[.08] px-3 py-2 dark:border-white/[.145] dark:bg-black"
          >
            <option value="SINGLE">Pick one</option>
            <option value="MULTI">Pick multiple</option>
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} />
          Required
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50"
        >
          Add group
        </button>
      </form>
    </div>
  );
}
