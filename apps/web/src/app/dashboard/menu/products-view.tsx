"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DashboardShell } from "@/components/owner-shell";
import { Icon } from "@/components/owner-icons";
import type { MenuCategory } from "@/lib/api";

/* Products list — Figma "Owner Dashboard V3 / Products" (node 35:10). Real menu
 * data from /api/menu/categories (flattened). MenuItem has an availability
 * flag but no inventory count, so the mock's "Low stock / N left" becomes
 * In stock / Out of stock from the real isAvailable flag. */

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function ProductsView({ categories, loadError }: { categories: MenuCategory[]; loadError?: boolean }) {
  const items = useMemo(
    () => categories.flatMap((c) => c.items.map((it) => ({ ...it, categoryName: c.name }))),
    [categories],
  );
  const [tab, setTab] = useState<"all" | "in" | "out">("all");
  const [cat, setCat] = useState<string>("all");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => (tab === "all" ? true : tab === "in" ? i.isAvailable : !i.isAvailable))
      .filter((i) => (cat === "all" ? true : i.categoryId === cat))
      .filter((i) => (q ? i.name.toLowerCase().includes(q) : true));
  }, [items, tab, cat, query]);

  return (
    <DashboardShell active="/dashboard/menu">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-semibold leading-[34px] tracking-[-0.3px]">Products</h1>
          <p className="mt-0.5 text-xs text-ink-muted">{items.length} product{items.length === 1 ? "" : "s"} · {categories.length} categor{categories.length === 1 ? "y" : "ies"}</p>
        </div>
        <Link href="/dashboard/menu/new" aria-label="New product" className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-ink text-white">
          <Icon name="plus" className="h-5 w-5" />
        </Link>
      </div>

      {loadError && <div className="mt-4 rounded-[18px] border border-danger/25 bg-danger/5 px-4 py-3 text-sm font-medium text-danger">Set up your restaurant before adding a menu.</div>}

      {/* Manage shortcuts */}
      <div className="mt-3 flex gap-2">
        <Link href="/dashboard/menu/categories" className="rounded-full border border-line bg-surface px-3.5 py-2 text-sm font-semibold text-ink-secondary">Categories</Link>
        <Link href="/dashboard/menu/modifiers" className="rounded-full border border-line bg-surface px-3.5 py-2 text-sm font-semibold text-ink-secondary">Modifiers</Link>
      </div>

      {/* Search */}
      <label className="mt-3 flex items-center gap-2.5 rounded-[16px] border border-line bg-surface px-3.5 py-3">
        <Icon name="search" className="h-[18px] w-[18px] text-ink-muted" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products" className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted" />
      </label>

      {/* Availability tabs */}
      <div className="mt-3 flex gap-2">
        {([["all", "All"], ["in", "In stock"], ["out", "Out of stock"]] as const).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)}
            className={`rounded-full px-3.5 py-2 text-sm font-semibold transition ${tab === key ? "bg-ink text-white" : "border border-line bg-surface text-ink-secondary"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Category pills */}
      {categories.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          <button type="button" onClick={() => setCat("all")}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${cat === "all" ? "bg-brand-soft text-brand" : "border border-line bg-surface text-ink-secondary"}`}>All</button>
          {categories.map((c) => (
            <button key={c.id} type="button" onClick={() => setCat(c.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${cat === c.id ? "bg-brand-soft text-brand" : "border border-line bg-surface text-ink-secondary"}`}>{c.name}</button>
          ))}
        </div>
      )}

      {/* List */}
      <div className="mt-4 space-y-2.5">
        {visible.length === 0 ? (
          <div className="rounded-[18px] border border-line bg-surface px-4 py-10 text-center text-sm text-ink-secondary">
            {items.length === 0 ? "No products yet — tap + to add your first one." : "No products match this filter."}
          </div>
        ) : (
          visible.map((it) => (
            <Link key={it.id} href={`/dashboard/menu/${it.id}`}
              className="flex items-center gap-3 rounded-[18px] border border-line bg-surface p-3 transition hover:border-brand/50">
              <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-subtle bg-cover bg-center text-ink-muted"
                style={it.imageUrl ? { backgroundImage: `url(${it.imageUrl})` } : undefined}>
                {!it.imageUrl && <Icon name="products" className="h-6 w-6" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-[17px] font-medium leading-[23px] text-ink">{it.name}</p>
                <p className="text-xs text-ink-secondary">{it.categoryName} · {money(it.priceCents)}</p>
                <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2px] ${it.isAvailable ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
                  {it.isAvailable ? "In stock" : "Out of stock"}
                </span>
              </div>
              <Icon name="chevron" className="h-[18px] w-[18px] shrink-0 text-ink-muted" />
            </Link>
          ))
        )}
      </div>
    </DashboardShell>
  );
}
