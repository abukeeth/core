"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ConceptDetails as ConceptDetailsType } from "./concept-data";

const ROWS: Array<[label: string, key: keyof ConceptDetailsType]> = [
  ["Brand Philosophy", "philosophy"],
  ["Color Palette", "palette"],
  ["Typography", "typographyDetail"],
  ["Experience", "experience"],
  ["Target Audience", "targetAudience"],
  ["Conversion Focus", "conversionFocus"],
  ["Business Personality", "personality"],
];

export function ConceptDetails({ details }: { details: ConceptDetailsType }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-[#E7DDCF]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.1em] text-[#756B5D]"
      >
        Concept Details
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-300 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      <div className={`grid transition-all duration-300 ease-out ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden">
          <dl className="flex flex-col gap-3 border-t border-[#EEE5D9] px-4 py-4">
            {ROWS.map(([label, key]) => (
              <div key={key}>
                <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#9A6A2F]">{label}</dt>
                <dd className="mt-0.5 text-xs leading-5 text-[#2A251F]">{details[key]}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
