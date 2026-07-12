"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteItem, updateItem, createItem, type MenuItem, type ModifierGroup } from "@/lib/api";
import { ItemDetailEditor } from "./item-detail-editor";

function formatPrice(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function AddItemForm({ categoryId }: { categoryId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const priceCents = Math.round(Number(price) * 100);
    if (!Number.isFinite(priceCents) || priceCents < 0) {
      setError("Enter a valid price");
      return;
    }

    setSubmitting(true);
    try {
      await createItem({ categoryId, name, priceCents });
      setName("");
      setPrice("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add item");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
        Item name
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded border border-black/[.08] px-3 py-2 dark:border-white/[.145] dark:bg-black"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
        Price ($)
        <input
          type="number"
          step="0.01"
          min="0"
          required
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-24 rounded border border-black/[.08] px-3 py-2 dark:border-white/[.145] dark:bg-black"
        />
      </label>
      <button
        type="submit"
        disabled={submitting}
        className="rounded-full bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50"
      >
        Add item
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}

export function ItemRow({ item, modifierGroups }: { item: MenuItem; modifierGroups: ModifierGroup[] }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function toggleAvailable() {
    setSubmitting(true);
    await updateItem(item.id, { isAvailable: !item.isAvailable }).finally(() => setSubmitting(false));
    router.refresh();
  }

  async function handleDelete() {
    setSubmitting(true);
    await deleteItem(item.id).finally(() => setSubmitting(false));
    router.refresh();
  }

  return (
    <li className="flex flex-col gap-2 py-1 text-sm">
      <div className="flex items-center justify-between gap-4">
        <span className={item.isAvailable ? "" : "text-zinc-400 line-through"}>
          {item.name} — ${formatPrice(item.priceCents)}
        </span>
        <span className="flex gap-3">
          <button type="button" onClick={() => setExpanded((e) => !e)} className="text-zinc-600 dark:text-zinc-400">
            {expanded ? "Hide options" : "Variants & modifiers"}
          </button>
          <button type="button" onClick={toggleAvailable} disabled={submitting} className="text-zinc-600 dark:text-zinc-400">
            {item.isAvailable ? "Mark unavailable" : "Mark available"}
          </button>
          <button type="button" onClick={handleDelete} disabled={submitting} className="text-red-600">
            Delete
          </button>
        </span>
      </div>
      {expanded && <ItemDetailEditor item={item} modifierGroups={modifierGroups} />}
    </li>
  );
}
