"use client";

import { Plus, Trash2 } from "lucide-react";
import type { FooterSettings, FooterSocialLink, LegalLink } from "@/lib/api";

const INPUT_CLASS = "min-h-11 w-full rounded-xl border border-[#E7DDCF] bg-white px-3 text-sm text-[#171512] outline-none focus:border-[#B97824]";
const LABEL_CLASS = "flex flex-col gap-1.5 text-sm font-semibold text-[#171512]";

const PLATFORMS: FooterSocialLink["platform"][] = ["instagram", "facebook", "tiktok", "x", "youtube", "website"];

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

export function FooterSettingsPanel({ value, onChange }: { value: FooterSettings | undefined; onChange: (next: FooterSettings) => void }) {
  const settings = value ?? {};

  function set<K extends keyof FooterSettings>(key: K, v: FooterSettings[K]) {
    onChange({ ...settings, [key]: v });
  }

  const socialLinks = settings.socialLinks ?? [];
  const legalLinks = settings.legalLinks ?? [];

  return (
    <div className="flex flex-col gap-4">
      <label className={LABEL_CLASS}>
        Business description
        <textarea value={settings.description ?? ""} onChange={(e) => set("description", e.target.value)} rows={3} className={`${INPUT_CLASS} min-h-20 py-2`} />
      </label>

      <Toggle label="Show contact info" checked={settings.showContactInfo ?? false} onChange={(v) => set("showContactInfo", v)} />
      <Toggle label="Show hours" checked={settings.showHours ?? false} onChange={(v) => set("showHours", v)} />
      <Toggle label="Newsletter signup" checked={settings.newsletterEnabled ?? false} onChange={(v) => set("newsletterEnabled", v)} />

      <label className={LABEL_CLASS}>
        Copyright text
        <input type="text" value={settings.copyrightText ?? ""} onChange={(e) => set("copyrightText", e.target.value)} placeholder="© 2026 Your Business" className={INPUT_CLASS} />
      </label>

      <div>
        <p className="mb-2 text-sm font-semibold text-[#171512]">Social links</p>
        <div className="flex flex-col gap-2">
          {socialLinks.map((link, index) => (
            <div key={index} className="flex gap-2">
              <select
                value={link.platform}
                onChange={(e) => set("socialLinks", socialLinks.map((l, i) => (i === index ? { ...l, platform: e.target.value as FooterSocialLink["platform"] } : l)))}
                className={`${INPUT_CLASS} w-32 shrink-0`}
              >
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={link.url}
                onChange={(e) => set("socialLinks", socialLinks.map((l, i) => (i === index ? { ...l, url: e.target.value } : l)))}
                placeholder="https://…"
                className={INPUT_CLASS}
              />
              <button type="button" onClick={() => set("socialLinks", socialLinks.filter((_, i) => i !== index))} className="shrink-0 rounded-full p-2 text-red-600 hover:bg-red-50" aria-label="Remove">
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => set("socialLinks", [...socialLinks, { platform: "instagram", url: "" }])}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#E7DDCF] py-2 text-sm font-bold text-[#A9681F]"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add social link
          </button>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-[#171512]">Legal links</p>
        <div className="flex flex-col gap-2">
          {legalLinks.map((link, index) => (
            <div key={index} className="flex gap-2">
              <input
                type="text"
                value={link.label}
                onChange={(e) => set("legalLinks", legalLinks.map((l, i) => (i === index ? { ...l, label: e.target.value } : l)))}
                placeholder="Privacy Policy"
                className={`${INPUT_CLASS} w-32 shrink-0`}
              />
              <input
                type="text"
                value={link.url}
                onChange={(e) => set("legalLinks", legalLinks.map((l, i) => (i === index ? ({ ...l, url: e.target.value } as LegalLink) : l)))}
                placeholder="/privacy"
                className={INPUT_CLASS}
              />
              <button type="button" onClick={() => set("legalLinks", legalLinks.filter((_, i) => i !== index))} className="shrink-0 rounded-full p-2 text-red-600 hover:bg-red-50" aria-label="Remove">
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => set("legalLinks", [...legalLinks, { label: "", url: "" }])}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#E7DDCF] py-2 text-sm font-bold text-[#A9681F]"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add legal link
          </button>
        </div>
      </div>

      <p className="text-xs text-[#8A7D6C]">&ldquo;Powered by OrderVora&rdquo; always appears in the footer.</p>
    </div>
  );
}
