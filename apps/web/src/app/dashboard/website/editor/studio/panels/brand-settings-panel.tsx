"use client";

import type { BrandSettings } from "@/lib/api";

const INPUT_CLASS = "min-h-11 w-full rounded-xl border border-[#E7DDCF] bg-white px-3 text-sm text-[#171512] outline-none focus:border-[#B97824]";
const LABEL_CLASS = "flex flex-col gap-1.5 text-sm font-semibold text-[#171512]";

const BUTTON_STYLES = [
  { value: "rounded", label: "Rounded" },
  { value: "pill", label: "Pill" },
  { value: "square", label: "Square" },
];
const SHADOW_LEVELS = [
  { value: "none", label: "None" },
  { value: "soft", label: "Soft" },
  { value: "medium", label: "Medium" },
  { value: "strong", label: "Strong" },
];
const PAGE_WIDTHS = [
  { value: "narrow", label: "Narrow" },
  { value: "standard", label: "Standard" },
  { value: "wide", label: "Wide" },
  { value: "full", label: "Full width" },
];
const SPACING_LEVELS = [
  { value: "compact", label: "Compact" },
  { value: "comfortable", label: "Comfortable" },
  { value: "spacious", label: "Spacious" },
];

function ColorField({ label, value, onChange }: { label: string; value?: string; onChange: (v: string | undefined) => void }) {
  return (
    <label className={LABEL_CLASS}>
      {label}
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value ?? "#B97824"}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-12 shrink-0 rounded-lg border border-[#E7DDCF] bg-white p-1"
        />
        <input
          type="text"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || undefined)}
          placeholder="Use theme default"
          className={INPUT_CLASS}
        />
      </div>
    </label>
  );
}

export function BrandSettingsPanel({ value, onChange }: { value: BrandSettings | undefined; onChange: (next: BrandSettings) => void }) {
  const settings = value ?? {};

  function set<K extends keyof BrandSettings>(key: K, v: BrandSettings[K]) {
    onChange({ ...settings, [key]: v });
  }

  return (
    <div className="flex flex-col gap-4">
      <ColorField label="Primary color" value={settings.primaryColor} onChange={(v) => set("primaryColor", v)} />
      <ColorField label="Secondary color" value={settings.secondaryColor} onChange={(v) => set("secondaryColor", v)} />
      <ColorField label="Accent color" value={settings.accentColor} onChange={(v) => set("accentColor", v)} />
      <ColorField label="Background color" value={settings.backgroundColor} onChange={(v) => set("backgroundColor", v)} />
      <ColorField label="Text color" value={settings.textColor} onChange={(v) => set("textColor", v)} />

      <label className={LABEL_CLASS}>
        Heading font
        <input type="text" value={settings.headingFont ?? ""} onChange={(e) => set("headingFont", e.target.value || undefined)} placeholder="Use theme default" className={INPUT_CLASS} />
      </label>
      <label className={LABEL_CLASS}>
        Body font
        <input type="text" value={settings.bodyFont ?? ""} onChange={(e) => set("bodyFont", e.target.value || undefined)} placeholder="Use theme default" className={INPUT_CLASS} />
      </label>

      <label className={LABEL_CLASS}>
        Button style
        <select value={settings.buttonStyle ?? ""} onChange={(e) => set("buttonStyle", (e.target.value || undefined) as BrandSettings["buttonStyle"])} className={INPUT_CLASS}>
          <option value="">Theme default</option>
          {BUTTON_STYLES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className={LABEL_CLASS}>
        Border radius ({settings.borderRadius ?? "theme default"}{settings.borderRadius !== undefined ? "px" : ""})
        <input
          type="range"
          min={0}
          max={32}
          value={settings.borderRadius ?? 8}
          onChange={(e) => set("borderRadius", Number(e.target.value))}
          className="w-full"
        />
      </label>

      <label className={LABEL_CLASS}>
        Shadow intensity
        <select value={settings.shadowIntensity ?? ""} onChange={(e) => set("shadowIntensity", (e.target.value || undefined) as BrandSettings["shadowIntensity"])} className={INPUT_CLASS}>
          <option value="">Theme default</option>
          {SHADOW_LEVELS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className={LABEL_CLASS}>
        Page width
        <select value={settings.pageWidth ?? ""} onChange={(e) => set("pageWidth", (e.target.value || undefined) as BrandSettings["pageWidth"])} className={INPUT_CLASS}>
          <option value="">Theme default</option>
          {PAGE_WIDTHS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className={LABEL_CLASS}>
        Content spacing
        <select value={settings.contentSpacing ?? ""} onChange={(e) => set("contentSpacing", (e.target.value || undefined) as BrandSettings["contentSpacing"])} className={INPUT_CLASS}>
          <option value="">Theme default</option>
          {SPACING_LEVELS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
