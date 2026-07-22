"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DetailShell } from "@/components/owner-shell";
import { Icon } from "@/components/owner-icons";
import {
  deleteItem,
  listMenuCategories,
  listModifierGroups,
  updateItem,
  uploadMenuItemImage,
  type MenuCategory,
  type MenuItem,
  type ModifierGroup,
} from "@/lib/api";
import { ItemDetailEditor } from "../item-detail-editor";

/* Product Editor — Figma "Owner Dashboard V3 / Product Editor" (node 35:120).
 * Edits real menu-item fields via updateItem; photo via uploadMenuItemImage;
 * variants + modifier-group attachments via the existing ItemDetailEditor
 * (reused unchanged to preserve that CRUD). Delete via deleteItem. */

const FIELD = "mt-1.5 w-full rounded-[14px] border border-line bg-surface px-3.5 py-3 text-sm text-ink outline-none transition focus:border-brand";

export default function ProductEditorPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [item, setItem] = useState<MenuItem | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [isAvailable, setIsAvailable] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ categories: cats }, { modifierGroups }] = await Promise.all([listMenuCategories(), listModifierGroups()]);
        if (cancelled) return;
        setCategories(cats);
        setGroups(modifierGroups);
        const found = cats.flatMap((c) => c.items).find((it) => it.id === id);
        if (!found) { setNotFound(true); return; }
        setItem(found);
        setName(found.name);
        setPrice((found.priceCents / 100).toFixed(2));
        setCategoryId(found.categoryId);
        setDescription(found.description ?? "");
        setIsAvailable(found.isAvailable);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load product");
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    const priceCents = Math.round(Number(price) * 100);
    if (!Number.isFinite(priceCents) || priceCents < 0) { setError("Enter a valid price."); return; }
    setSaving(true);
    setError(null);
    try {
      const { item: updated } = await updateItem(id, {
        name,
        priceCents,
        description: description || undefined,
        categoryId,
        isAvailable,
      });
      setItem(updated);
      router.push("/dashboard/menu");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save product");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this product? This cannot be undone.")) return;
    setSaving(true);
    try {
      await deleteItem(id);
      router.push("/dashboard/menu");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete product");
      setSaving(false);
    }
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const { item: updated } = await uploadMenuItemImage(id, file);
      setItem(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload image");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (notFound) {
    return (
      <DetailShell title="Product" backHref="/dashboard/menu">
        <div className="rounded-[18px] border border-line bg-surface px-4 py-10 text-center text-sm text-ink-secondary">This product no longer exists.</div>
      </DetailShell>
    );
  }
  if (!item) {
    return (
      <DetailShell title="Edit product" backHref="/dashboard/menu">
        {error ? <div className="rounded-[18px] border border-danger/25 bg-danger/5 px-4 py-3 text-sm font-medium text-danger">{error}</div>
          : <div className="space-y-3"><div className="h-40 animate-pulse rounded-[18px] border border-line bg-surface" /><div className="h-24 animate-pulse rounded-[18px] border border-line bg-surface" /></div>}
      </DetailShell>
    );
  }

  const deleteButton = (
    <button type="button" onClick={handleDelete} disabled={saving} className="rounded-[12px] px-3 py-1.5 text-sm font-semibold text-danger disabled:opacity-50">Delete</button>
  );
  const footer = (
    <>
      <button type="button" onClick={() => router.push("/dashboard/menu")} className="flex-1 rounded-[16px] border border-line bg-surface px-4 py-3.5 text-sm font-semibold text-ink">Cancel</button>
      <button type="submit" form="product-form" disabled={saving} className="flex-1 rounded-[16px] bg-brand px-4 py-3.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Save product"}</button>
    </>
  );

  return (
    <DetailShell title="Edit product" backHref="/dashboard/menu" headerRight={deleteButton} footer={footer}>
      <form id="product-form" onSubmit={handleSave} className="space-y-4">
        {/* Photo */}
        <div className="flex items-center gap-3.5 rounded-[18px] border border-line bg-surface p-4">
          <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-subtle bg-cover bg-center text-ink-muted"
            style={item.imageUrl ? { backgroundImage: `url(${item.imageUrl})` } : undefined}>
            {!item.imageUrl && <Icon name="products" className="h-7 w-7" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[17px] font-medium text-ink">Product photo</p>
            <p className="text-xs text-ink-muted">Square image recommended · JPG or PNG</p>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="mt-1 text-sm font-semibold text-brand disabled:opacity-50">
              {uploading ? "Uploading…" : item.imageUrl ? "Replace image" : "Add image"}
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleFile} className="hidden" />
        </div>

        {error && <div className="rounded-[14px] border border-danger/25 bg-danger/5 px-4 py-3 text-sm font-medium text-danger">{error}</div>}

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

        <div className="flex items-center gap-3 rounded-[18px] border border-line bg-surface px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <p className="font-display text-[17px] font-medium leading-[23px] text-ink">Available for ordering</p>
            <p className="text-xs text-ink-secondary">Turn off to hide this product temporarily.</p>
          </div>
          <button type="button" role="switch" aria-checked={isAvailable} aria-label="Available for ordering"
            onClick={() => setIsAvailable((v) => !v)}
            className={`relative h-[28px] w-[50px] shrink-0 rounded-full transition-colors ${isAvailable ? "bg-success" : "bg-line"}`}>
            <span className={`absolute top-[3px] size-[22px] rounded-full bg-white shadow-sm transition-all ${isAvailable ? "left-[25px]" : "left-[3px]"}`} />
          </button>
        </div>
      </form>

      {/* Options & modifiers + variants (existing editor, functionality preserved) */}
      <section className="mt-5">
        <h2 className="font-display text-[19px] font-semibold leading-[25px] text-ink">Options &amp; modifiers</h2>
        <div className="mt-2 rounded-[18px] border border-line bg-surface p-4">
          <ItemDetailEditor item={item} modifierGroups={groups} />
        </div>
      </section>
    </DetailShell>
  );
}
