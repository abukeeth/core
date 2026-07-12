"use client";

import { useState } from "react";
import { Check, RotateCw } from "lucide-react";
import { Button } from "@/components/ui";
import { ConceptDetails } from "./concept-details";
import { ConceptPhonePreview } from "./concept-phone-preview";
import type { PreparedConcept } from "./concept-data";

const META_ROWS: Array<[label: string, key: keyof PreparedConcept]> = [
  ["Typography Style", "typography"],
  ["Button Style", "buttonStyle"],
  ["Navigation Style", "navigationStyle"],
  ["Product Card Style", "productCardStyle"],
  ["Animation Style", "animationStyle"],
];

interface BrandConceptCardProps {
  label: string;
  concept: PreparedConcept;
  selected: boolean;
  onSelect: () => void;
  onRegenerate: () => void;
}

export function BrandConceptCard({ label, concept, selected, onSelect, onRegenerate }: BrandConceptCardProps) {
  const [regenerating, setRegenerating] = useState(false);

  function handleRegenerate() {
    setRegenerating(true);
    setTimeout(() => {
      onRegenerate();
      setRegenerating(false);
    }, 600);
  }

  return (
    <div
      className={`flex flex-col gap-4 rounded-2xl border p-4 transition-all duration-300 ${
        selected
          ? "border-[#171512] bg-[#FBF7F1] shadow-[0_16px_36px_rgba(48,39,27,0.1)] ring-1 ring-[#171512]"
          : "border-[#E7DDCF] bg-white hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(48,39,27,0.08)]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#9A6A2F]">{label}</p>
        {selected && (
          <span className="flex items-center gap-1 rounded-full bg-[#171512] px-2.5 py-1 text-[10px] font-bold text-white">
            <Check className="h-3 w-3" aria-hidden="true" />
            Selected
          </span>
        )}
      </div>

      <div>
        <h3 className="text-lg font-bold text-[#171512]">{concept.name}</h3>
        <p className="mt-1 text-xs leading-5 text-[#756B5D]">{concept.description}</p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-[#FBF7F1] p-2.5">
          <p className="font-bold uppercase tracking-[0.06em] text-[#9A6A2F]" style={{ fontSize: "10px" }}>Business Style</p>
          <p className="mt-0.5 font-semibold text-[#171512]">{concept.businessStyle}</p>
        </div>
        <div className="rounded-xl bg-[#FBF7F1] p-2.5">
          <p className="font-bold uppercase tracking-[0.06em] text-[#9A6A2F]" style={{ fontSize: "10px" }}>Best For</p>
          <p className="mt-0.5 font-semibold text-[#171512]">{concept.bestFor}</p>
        </div>
      </div>

      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#9A6A2F]">Primary Colors</p>
        <div className="mt-1.5 flex gap-2">
          {(["primary", "secondary", "accent"] as const).map((key) => (
            <div key={key} className="flex flex-1 flex-col items-center gap-1">
              <span
                className="h-8 w-full rounded-lg border border-[#E7DDCF]"
                style={{ backgroundColor: concept.colors[key] }}
                title={concept.colors[key]}
              />
              <span className="text-[9px] font-medium capitalize text-[#8A7D6C]">{key}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {META_ROWS.map(([metaLabel, key]) => (
          <span key={key} className="rounded-full bg-[#F7F0E5] px-2.5 py-1 text-[10px] font-semibold text-[#756B5D]">
            {metaLabel}: <span className="text-[#171512]">{String(concept[key])}</span>
          </span>
        ))}
      </div>

      <ConceptPhonePreview concept={concept} />

      <ConceptDetails details={concept.details} />

      <div className="mt-auto flex flex-col gap-2">
        <Button variant={selected ? "primary" : "secondary"} size="sm" className="w-full" onClick={onSelect}>
          {selected ? "Selected" : "Select Concept"}
        </Button>
        <button
          type="button"
          onClick={handleRegenerate}
          disabled={regenerating}
          className="flex min-h-9 w-full items-center justify-center gap-1.5 rounded-full text-xs font-bold text-[#756B5D] transition active:scale-[0.99] disabled:opacity-60"
        >
          <RotateCw className={`h-3.5 w-3.5 ${regenerating ? "animate-spin" : ""}`} aria-hidden="true" />
          {regenerating ? "Regenerating…" : "Regenerate"}
        </button>
      </div>
    </div>
  );
}
