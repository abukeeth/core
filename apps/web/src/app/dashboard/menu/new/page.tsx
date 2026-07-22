"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DetailShell } from "@/components/owner-shell";
import { createItem, listMenuCategories, type MenuCategory } from "@/lib/api";

/* New product — create flow for the Products list "+" (Figma 35:10/35:120).
 * Uses the real createItem API; on success continues to the product editor so
 * the owner can add a photo, variants and modifiers. */

const FIELD = "mt-1.5 w-full rounded-[14px] border border-line bg-surface px-3.5 py-3 text-sm text-ink outline-none transition focus:border-brand";

export default function NewProductPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listMenuCategories()
      .then(({ categories: cats }) => {
        if (cancelled) return;
        setCategories(cats);
        if (cats[0]) setCategoryId(cats[0].id);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load categories"); });
    return () => { cancelled = true; };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const priceCents = Math.round(Number(price) * 100);
    if (!Number.isFinite(priceCents) || priceCents < 0) { setError("Enter a valid price."); return; }
    if (!categoryId) { setError("Create a category first."); return; }
    setSaving(true);
    setError(null);
    try {
      const { item } = await createItem({ categoryId, name, priceCents, description: description || undefined });
      router.push(`/dashboard/menu/${item.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create product");
      setSaving(false);
    }
  }

  const footer = (
    <>
      <button type="button" onClick={() => router.push("/dashboard/menu")} className="flex-1 rounded-[16px] border border-line bg-surface px-4 py-3.5 text-sm font-semibold text-ink">Cancel</button>
      <button type="submit" form="new-product-form" disabled={saving} className="flex-1 rounded-[16px] bg-brand px-4 py-3.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Creating…" : "Create product"}</button>
    </>
  );

  return (
    <DetailShell title="New product" backHref="/dashboard/menu" footer={footer}>
      <form id="new-product-form" onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="rounded-[14px] border border-danger/25 bg-danger/5 px-4 py-3 text-sm font-medium text-danger">{error}</div>}
        {categories.length === 0 && !error && (
          <div className="rounded-[14px] border border-line bg-subtle px-4 py-3 text-sm text-ink-secondary">
            You need a category first. <Link href="/dashboard/menu/categories" className="font-semibold text-brand">Add one →</Link>
          </div>
        )}

        <label className="block">
          <span className="text-sm font-semibold text-ink">Product name</span>
          <input required value={name} onChange={(e) => setName(e.target.value)} className={FIELD} placeholder="e.g. Classic Cheeseburger" />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-semibold text-ink">Price</span>
            <input required type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className={FIELD} placeholder="0.00" />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-ink">Category</span>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={FIELD}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-semibold text-ink">Description</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={`${FIELD} resize-none`} placeholder="Describe this product for customers." />
        </label>

        <p className="text-xs text-ink-muted">You can add a photo, variants and modifiers after creating the product.</p>
      </form>
    </DetailShell>
  );
}
