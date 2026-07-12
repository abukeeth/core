"use client";

import { useEffect, useState } from "react";
import {
  attachModifierGroup,
  createVariant,
  deleteVariant,
  detachModifierGroup,
  listItemModifierGroups,
  listVariants,
  type MenuItem,
  type MenuItemVariant,
  type ModifierGroup,
} from "@/lib/api";

function formatDelta(cents: number): string {
  const dollars = (Math.abs(cents) / 100).toFixed(2);
  return cents < 0 ? `-$${dollars}` : `+$${dollars}`;
}

export function ItemDetailEditor({ item, modifierGroups }: { item: MenuItem; modifierGroups: ModifierGroup[] }) {
  const [variants, setVariants] = useState<MenuItemVariant[]>([]);
  const [attachedGroupIds, setAttachedGroupIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [variantName, setVariantName] = useState("");
  const [variantPrice, setVariantPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listVariants(item.id), listItemModifierGroups(item.id)])
      .then(([variantsRes, attachmentsRes]) => {
        setVariants(variantsRes.variants);
        setAttachedGroupIds(new Set(attachmentsRes.attachments.map((a) => a.modifierGroupId)));
      })
      .catch(() => setError("Failed to load item details"))
      .finally(() => setLoading(false));
  }, [item.id]);

  async function handleAddVariant(event: React.FormEvent) {
    event.preventDefault();
    const priceDeltaCents = Math.round(Number(variantPrice || "0") * 100);
    setBusy(true);
    setError(null);
    try {
      const { variant } = await createVariant(item.id, { name: variantName, priceDeltaCents });
      setVariants((prev) => [...prev, variant]);
      setVariantName("");
      setVariantPrice("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add variant");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteVariant(variantId: string) {
    setBusy(true);
    try {
      await deleteVariant(item.id, variantId);
      setVariants((prev) => prev.filter((v) => v.id !== variantId));
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleModifierGroup(groupId: string, attached: boolean) {
    setBusy(true);
    try {
      if (attached) {
        await detachModifierGroup(item.id, groupId);
        setAttachedGroupIds((prev) => {
          const next = new Set(prev);
          next.delete(groupId);
          return next;
        });
      } else {
        await attachModifierGroup(item.id, groupId);
        setAttachedGroupIds((prev) => new Set(prev).add(groupId));
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="py-2 text-xs text-zinc-500 dark:text-zinc-400">Loading...</p>;
  }

  return (
    <div className="flex flex-col gap-4 rounded border border-black/[.08] bg-zinc-50 p-4 dark:border-white/[.145] dark:bg-black">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-col gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Variants (e.g. sizes)</h4>
        <ul className="flex flex-col divide-y divide-black/[.06] text-sm dark:divide-white/[.08]">
          {variants.map((variant) => (
            <li key={variant.id} className="flex items-center justify-between py-1">
              <span>
                {variant.name}
                {variant.priceDeltaCents !== 0 && <span className="text-zinc-500"> ({formatDelta(variant.priceDeltaCents)})</span>}
                {variant.isDefault && <span className="ml-1 text-xs text-zinc-500">(default)</span>}
              </span>
              <button type="button" onClick={() => handleDeleteVariant(variant.id)} disabled={busy} className="text-xs text-red-600">
                Remove
              </button>
            </li>
          ))}
          {variants.length === 0 && <li className="py-1 text-zinc-500 dark:text-zinc-400">No variants — item has a single price.</li>}
        </ul>
        <form onSubmit={handleAddVariant} className="flex items-end gap-2">
          <input
            type="text"
            required
            placeholder="e.g. Large"
            value={variantName}
            onChange={(e) => setVariantName(e.target.value)}
            className="flex-1 rounded border border-black/[.08] px-2 py-1 text-sm dark:border-white/[.145] dark:bg-zinc-950"
          />
          <input
            type="number"
            step="0.01"
            placeholder="+/- price"
            value={variantPrice}
            onChange={(e) => setVariantPrice(e.target.value)}
            className="w-24 rounded border border-black/[.08] px-2 py-1 text-sm dark:border-white/[.145] dark:bg-zinc-950"
          />
          <button type="submit" disabled={busy} className="rounded-full border border-black/[.08] px-3 py-1 text-xs dark:border-white/[.145]">
            Add variant
          </button>
        </form>
      </div>

      <div className="flex flex-col gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Modifier groups</h4>
        {modifierGroups.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No modifier groups exist yet — create one below the menu.</p>
        )}
        <ul className="flex flex-col gap-1 text-sm">
          {modifierGroups.map((group) => {
            const attached = attachedGroupIds.has(group.id);
            return (
              <li key={group.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={attached}
                  disabled={busy}
                  onChange={() => handleToggleModifierGroup(group.id, attached)}
                />
                <span>{group.name}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
