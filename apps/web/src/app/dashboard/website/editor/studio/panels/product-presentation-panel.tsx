"use client";

import type { ProductPresentation } from "@/lib/api";

const INPUT_CLASS = "min-h-11 w-full rounded-xl border border-[#E7DDCF] bg-white px-3 text-sm text-[#171512] outline-none focus:border-[#B97824]";
const LABEL_CLASS = "flex flex-col gap-1.5 text-sm font-semibold text-[#171512]";

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm font-semibold text-[#171512]">
      {label}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? "bg-[#B97824]" : "bg-[#E7DDCF]"}`}
      >
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${checked ? "left-6" : "left-1"}`} />
      </button>
    </label>
  );
}

/** Deliberately no "image ratio" or "dietary badges" controls here — MenuItem has neither an image nor a dietary-tag field in this data model, so those toggles would change nothing visible. See menu-section.ts's doc comment. */
export function ProductPresentationPanel({ value, onChange }: { value: ProductPresentation | undefined; onChange: (next: ProductPresentation) => void }) {
  const settings = value ?? {};

  function set<K extends keyof ProductPresentation>(key: K, v: ProductPresentation[K]) {
    onChange({ ...settings, [key]: v });
  }

  return (
    <div className="flex flex-col gap-4">
      <label className={LABEL_CLASS}>
        Category navigation
        <select value={settings.categoryNavStyle ?? "sticky"} onChange={(e) => set("categoryNavStyle", e.target.value as ProductPresentation["categoryNavStyle"])} className={INPUT_CLASS}>
          <option value="sticky">Sticky</option>
          <option value="simple">Simple</option>
        </select>
      </label>

      <label className={LABEL_CLASS}>
        Card layout
        <select value={settings.cardLayout ?? "list"} onChange={(e) => set("cardLayout", e.target.value as ProductPresentation["cardLayout"])} className={INPUT_CLASS}>
          <option value="list">List</option>
          <option value="grid">Grid</option>
        </select>
      </label>

      <label className={LABEL_CLASS}>
        Info density
        <select value={settings.infoDensity ?? "detailed"} onChange={(e) => set("infoDensity", e.target.value as ProductPresentation["infoDensity"])} className={INPUT_CLASS}>
          <option value="detailed">Detailed (show descriptions)</option>
          <option value="compact">Compact</option>
        </select>
      </label>

      <label className={LABEL_CLASS}>
        Price style
        <select value={settings.priceStyle ?? "standard"} onChange={(e) => set("priceStyle", e.target.value as ProductPresentation["priceStyle"])} className={INPUT_CLASS}>
          <option value="standard">Standard</option>
          <option value="bold">Bold</option>
          <option value="minimal">Minimal</option>
        </select>
      </label>

      <label className={LABEL_CLASS}>
        Out-of-stock items
        <select value={settings.outOfStockAppearance ?? "hidden"} onChange={(e) => set("outOfStockAppearance", e.target.value as ProductPresentation["outOfStockAppearance"])} className={INPUT_CLASS}>
          <option value="hidden">Hide entirely</option>
          <option value="dimmed">Show, dimmed</option>
          <option value="badge">Show with &quot;Sold out&quot; badge</option>
        </select>
      </label>

      <Toggle label="Show &quot;Customizable&quot; badge on items with modifiers" checked={settings.showModifiersBadge ?? false} onChange={(v) => set("showModifiersBadge", v)} />
    </div>
  );
}
