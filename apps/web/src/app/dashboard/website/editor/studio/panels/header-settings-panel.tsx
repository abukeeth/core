"use client";

import type { HeaderSettings } from "@/lib/api";

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

export function HeaderSettingsPanel({ value, onChange }: { value: HeaderSettings | undefined; onChange: (next: HeaderSettings) => void }) {
  const settings = value ?? {};

  function set<K extends keyof HeaderSettings>(key: K, v: HeaderSettings[K]) {
    onChange({ ...settings, [key]: v });
  }

  return (
    <div className="flex flex-col gap-4">
      <label className={LABEL_CLASS}>
        Logo position
        <select value={settings.logoPosition ?? "left"} onChange={(e) => set("logoPosition", e.target.value as HeaderSettings["logoPosition"])} className={INPUT_CLASS}>
          <option value="left">Left</option>
          <option value="center">Center</option>
        </select>
      </label>

      <label className={LABEL_CLASS}>
        Header layout
        <select value={settings.headerLayout ?? "standard"} onChange={(e) => set("headerLayout", e.target.value as HeaderSettings["headerLayout"])} className={INPUT_CLASS}>
          <option value="standard">Standard</option>
          <option value="minimal">Minimal (no nav links)</option>
          <option value="centered">Centered, stacked</option>
        </select>
      </label>

      <Toggle label="Sticky header" checked={settings.stickyHeader ?? false} onChange={(v) => set("stickyHeader", v)} />
      <Toggle label="Show search" checked={settings.showSearch ?? false} onChange={(v) => set("showSearch", v)} />
      <Toggle label="Show cart" checked={settings.showCart ?? true} onChange={(v) => set("showCart", v)} />
      <Toggle label="Show account" checked={settings.showAccount ?? false} onChange={(v) => set("showAccount", v)} />
      <Toggle label="Show order button" checked={settings.showOrderButton ?? true} onChange={(v) => set("showOrderButton", v)} />

      <label className={LABEL_CLASS}>
        Mobile navigation style
        <select value={settings.mobileNavStyle ?? "drawer"} onChange={(e) => set("mobileNavStyle", e.target.value as HeaderSettings["mobileNavStyle"])} className={INPUT_CLASS}>
          <option value="drawer">Drawer</option>
          <option value="bottomTabs">Bottom tabs</option>
        </select>
      </label>

      <div className="rounded-xl border border-[#E7DDCF] bg-[#FBF7F1] p-3">
        <Toggle label="Announcement bar" checked={settings.announcementBar?.enabled ?? false} onChange={(v) => set("announcementBar", { ...settings.announcementBar, enabled: v })} />
        {settings.announcementBar?.enabled && (
          <div className="mt-3 flex flex-col gap-3">
            <label className={LABEL_CLASS}>
              Message
              <input
                type="text"
                value={settings.announcementBar?.text ?? ""}
                onChange={(e) => set("announcementBar", { ...settings.announcementBar, enabled: true, text: e.target.value })}
                className={INPUT_CLASS}
              />
            </label>
            <label className={LABEL_CLASS}>
              Link (optional)
              <input
                type="text"
                value={settings.announcementBar?.link ?? ""}
                onChange={(e) => set("announcementBar", { ...settings.announcementBar, enabled: true, link: e.target.value })}
                className={INPUT_CLASS}
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
