"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { approveImportJob, rejectImportJob, updateImportJobData, type ExtractedMenuData, type ImportJob } from "@/lib/api";

interface EditableItem {
  key: string;
  category: string;
  name: string;
  description?: string;
  priceCents: number;
  confidence?: number;
}

function flatten(data: ExtractedMenuData): EditableItem[] {
  return data.categories.flatMap((category, categoryIndex) =>
    category.items.map((item, itemIndex) => ({
      key: `${categoryIndex}-${itemIndex}`,
      category: category.name,
      name: item.name,
      description: item.description,
      priceCents: item.priceCents,
      confidence: item.confidence,
    })),
  );
}

function toExtractedMenuData(items: EditableItem[], businessProfile: ExtractedMenuData["businessProfile"]): ExtractedMenuData {
  const byCategory = new Map<string, EditableItem[]>();
  for (const item of items) {
    const existing = byCategory.get(item.category) ?? [];
    existing.push(item);
    byCategory.set(item.category, existing);
  }
  return {
    categories: [...byCategory.entries()].map(([name, categoryItems]) => ({
      name,
      items: categoryItems.map((item) => ({
        name: item.name,
        description: item.description,
        priceCents: item.priceCents,
        confidence: item.confidence,
      })),
    })),
    ...(businessProfile ? { businessProfile } : {}),
  };
}

function formatDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function confidenceClass(confidence: number): string {
  if (confidence >= 0.8) return "bg-emerald-50 text-emerald-700";
  if (confidence >= 0.5) return "bg-amber-50 text-amber-700";
  return "bg-red-50 text-red-700";
}

export function ReviewEditor({ job }: { job: ImportJob }) {
  const router = useRouter();
  const [items, setItems] = useState<EditableItem[]>(() => flatten(job.extractedData ?? { categories: [] }));
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [moveTarget, setMoveTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const categoryNames = [...new Set(items.map((item) => item.category))];
  const businessProfile = job.extractedData?.businessProfile;
  const selectedCount = selectedKeys.size;

  function toggleSelected(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleCategorySelected(categoryName: string) {
    const categoryKeys = items.filter((item) => item.category === categoryName).map((item) => item.key);
    const allSelected = categoryKeys.every((key) => selectedKeys.has(key));
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const key of categoryKeys) {
        if (allSelected) next.delete(key);
        else next.add(key);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedKeys(new Set());
    setMoveTarget("");
  }

  function handleDeleteSelected() {
    setItems((prev) => prev.filter((item) => !selectedKeys.has(item.key)));
    clearSelection();
  }

  function handleMoveSelected() {
    const target = moveTarget.trim();
    if (!target) return;
    setItems((prev) => prev.map((item) => (selectedKeys.has(item.key) ? { ...item, category: target } : item)));
    clearSelection();
  }

  function updateItem(key: string, patch: Partial<EditableItem>) {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  async function persistEdits() {
    await updateImportJobData(job.id, toExtractedMenuData(items, businessProfile));
  }

  async function handleSave() {
    setError(null);
    setSubmitting(true);
    try {
      await persistEdits();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApprove() {
    setError(null);
    setSubmitting(true);
    try {
      await persistEdits();
      await approveImportJob(job.id);
      router.push("/dashboard/builder");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve import");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReject() {
    setError(null);
    setSubmitting(true);
    try {
      await rejectImportJob(job.id);
      router.push("/dashboard/import");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject import");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {selectedCount > 0 && (
        <div className="sticky top-2 z-30 flex flex-col gap-3 rounded-2xl border border-[#B97824] bg-[#FFF8ED] p-3 shadow-[0_8px_24px_rgba(185,120,36,0.12)] sm:flex-row sm:items-center">
          <span className="text-sm font-bold text-[#171512]">{selectedCount} selected</span>
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              list="review-editor-category-names"
              value={moveTarget}
              onChange={(e) => setMoveTarget(e.target.value)}
              placeholder="Move to category…"
              className="min-h-11 w-full rounded-xl border border-[#E7DDCF] bg-white px-3 text-sm text-[#171512] outline-none focus:border-[#B97824] sm:max-w-xs"
            />
            <datalist id="review-editor-category-names">
              {categoryNames.map((name) => <option key={name} value={name} />)}
            </datalist>
            <div className="flex gap-2">
              <button type="button" onClick={handleMoveSelected} disabled={!moveTarget.trim()} className="min-h-11 flex-1 rounded-xl border border-[#E7DDCF] bg-white px-4 text-sm font-bold text-[#171512] disabled:opacity-50 sm:flex-none">Move</button>
              <button type="button" onClick={handleDeleteSelected} className="min-h-11 flex-1 rounded-xl bg-red-600 px-4 text-sm font-bold text-white sm:flex-none">Delete selected</button>
              <button type="button" onClick={clearSelection} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-[#756B5D]">Clear</button>
            </div>
          </div>
        </div>
      )}

      {categoryNames.map((categoryName) => {
        const categoryItems = items.filter((item) => item.category === categoryName);
        const allSelected = categoryItems.every((item) => selectedKeys.has(item.key));
        return (
          <section key={categoryName}>
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => toggleCategorySelected(categoryName)}
                  aria-label={`Select all in ${categoryName}`}
                  className="h-4 w-4 shrink-0 accent-[#B97824]"
                />
                <h2 className="text-lg font-bold tracking-tight sm:text-xl">{categoryName}</h2>
              </label>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#756B5D] shadow-sm">{`${categoryItems.length} item${categoryItems.length === 1 ? "" : "s"}`}</span>
            </div>

            <div className="mt-3 overflow-hidden rounded-2xl border border-[#E7DDCF] bg-white shadow-[0_8px_24px_rgba(48,39,27,0.04)]">
              {categoryItems.map((item, index) => (
                <article key={item.key} className={`px-3 py-3 sm:px-4 ${index > 0 ? "border-t border-[#EEE5D9]" : ""} ${selectedKeys.has(item.key) ? "bg-[#FFF8ED]" : ""}`}>
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedKeys.has(item.key)}
                      onChange={() => toggleSelected(item.key)}
                      aria-label={`Select ${item.name}`}
                      className="mt-1 h-5 w-5 shrink-0 accent-[#B97824]"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="grid grid-cols-[1fr_auto] items-start gap-3">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => updateItem(item.key, { name: e.target.value })}
                          className="min-w-0 w-full rounded-lg border border-transparent bg-transparent px-0 py-0.5 text-sm font-bold text-[#171512] outline-none focus:border-[#E7DDCF] focus:bg-[#FFFDF9] focus:px-2 sm:text-base"
                        />
                        <label className="flex shrink-0 items-center gap-1 text-sm font-semibold text-[#756B5D]">
                          $
                          <input
                            type="number"
                            step="0.01"
                            value={formatDollars(item.priceCents)}
                            onChange={(e) => updateItem(item.key, { priceCents: Math.round(Number(e.target.value) * 100) })}
                            className="w-20 rounded-lg border border-[#E7DDCF] bg-[#FFFDF9] px-2 py-1.5 text-right font-bold text-[#171512] outline-none focus:border-[#B97824]"
                          />
                        </label>
                      </div>

                      {item.description && (
                        <textarea
                          value={item.description}
                          onChange={(e) => updateItem(item.key, { description: e.target.value })}
                          rows={1}
                          className="mt-1 w-full resize-none rounded-lg border border-transparent bg-transparent px-0 py-0.5 text-xs leading-5 text-[#756B5D] outline-none focus:border-[#E7DDCF] focus:bg-[#FFFDF9] focus:px-2 sm:text-sm"
                        />
                      )}

                      {item.confidence !== undefined && (
                        <div className="mt-1">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${confidenceClass(item.confidence)}`}>
                            {Math.round(item.confidence * 100)}%
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}

      <div className="sticky bottom-20 z-40 rounded-3xl border border-[#E7DDCF] bg-white/96 p-3 shadow-[0_18px_50px_rgba(48,39,27,0.16)] backdrop-blur-xl lg:bottom-4">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <button type="button" onClick={handleSave} disabled={submitting} className="min-h-12 rounded-2xl border border-[#E7DDCF] px-4 text-sm font-bold text-[#2A251F] disabled:opacity-50">Save changes</button>
          <button type="button" onClick={handleApprove} disabled={submitting} className="min-h-12 rounded-2xl bg-[#171512] px-4 text-sm font-bold text-white disabled:opacity-50">Approve & continue</button>
          <button type="button" onClick={handleReject} disabled={submitting} className="col-span-2 min-h-11 rounded-2xl px-4 text-sm font-semibold text-red-600 disabled:opacity-50 sm:col-auto">Reject import</button>
        </div>
      </div>
    </div>
  );
}
