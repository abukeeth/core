"use client";

import { useState } from "react";
import { Check, Columns3, Sparkles } from "lucide-react";
import { Card } from "@/components/ui";
import { BrandConceptCard } from "./brand-concepts/brand-concept-card";
import { CompareConcepts } from "./brand-concepts/compare-concepts";
import { CONCEPT_FAMILIES, conceptAt } from "./brand-concepts/concept-data";
import { GenerateConceptsButton } from "./brand-concepts/generate-concepts-button";

const LABELS = ["Concept A", "Concept B", "Concept C"];

export function AiBrandConcepts() {
  const [variationIndexes, setVariationIndexes] = useState<number[]>(() => CONCEPT_FAMILIES.map(() => 0));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);

  const concepts = CONCEPT_FAMILIES.map((family, index) => conceptAt(family, variationIndexes[index]!));
  const selectedConcept = concepts.find((c) => c.id === selectedId) ?? null;
  const selectedIndex = concepts.findIndex((c) => c.id === selectedId);

  function regenerateAll() {
    setVariationIndexes((prev) => prev.map((value) => value + 1));
  }

  function regenerateOne(familyIndex: number) {
    setVariationIndexes((prev) => prev.map((value, index) => (index === familyIndex ? value + 1 : value)));
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">AI BRAND CONCEPTS</p>
          <h2 className="mt-1 text-lg font-bold text-[#171512]">Choose a direction for your site</h2>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F7EBDD] text-[#A9681F]">
          <Sparkles className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
      </div>

      <div className="mt-4">
        <GenerateConceptsButton onComplete={regenerateAll} />
      </div>

      <div
        className={`mt-4 grid transition-all duration-300 ease-out ${
          selectedConcept ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          {selectedConcept && (
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                <Check className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-emerald-700">Selected Brand · Current Active Concept</p>
                <p className="truncate text-sm font-bold text-[#171512]">
                  {LABELS[selectedIndex]} — {selectedConcept.name}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setComparing((v) => !v)}
        aria-expanded={comparing}
        className="mt-4 flex items-center gap-2 text-xs font-bold text-[#A9681F] transition hover:text-[#8A5615]"
      >
        <Columns3 className="h-4 w-4" aria-hidden="true" />
        {comparing ? "Hide comparison" : "Compare Concepts"}
      </button>

      <div className={`grid transition-all duration-300 ease-out ${comparing ? "mt-4 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden">
          <CompareConcepts concepts={concepts} labels={LABELS} />
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {concepts.map((concept, index) => (
          <BrandConceptCard
            key={concept.id}
            label={LABELS[index]!}
            concept={concept}
            selected={selectedId === concept.id}
            onSelect={() => setSelectedId(concept.id)}
            onRegenerate={() => regenerateOne(index)}
          />
        ))}
      </div>
    </Card>
  );
}
