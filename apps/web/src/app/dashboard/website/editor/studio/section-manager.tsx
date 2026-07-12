"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Copy, Eye, EyeOff, Plus, Trash2, X } from "lucide-react";
import type { SiteSectionBlock } from "@/lib/api";
import { moveItem } from "@/lib/site-editor";
import { ADDABLE_SECTION_TYPES, SECTION_LABELS } from "./section-fields";

interface SectionManagerProps {
  sections: SiteSectionBlock[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  onChange: (next: SiteSectionBlock[]) => void;
}

export function defaultPropsForType(type: string): Record<string, unknown> {
  if (type === "hero") return { headline: "Welcome", subhead: "", ctaLabel: "View Menu" };
  if (type === "featuredCategories") return { title: "Explore the Menu" };
  if (type === "featuredProducts") return { title: "Featured" };
  if (type === "bestSellers") return { title: "Best Sellers" };
  if (type === "offers") return { title: "Current Offers" };
  if (type === "aboutTeaser") return { excerpt: "" };
  if (type === "aboutStory") return { story: "" };
  if (type === "hoursLocation") return {};
  if (type === "reviews") return { title: "What Customers Say", reviews: [] };
  if (type === "gallery") return { intro: "" };
  if (type === "loyalty") return { title: "Earn Rewards" };
  if (type === "appPromotion") return { headline: "Get the App" };
  if (type === "ctaBanner") return { label: "View Menu" };
  if (type === "contactInfo") return {};
  if (type === "newsletter") return { title: "Stay in the loop" };
  if (type === "customTextImage") return { heading: "", body: "" };
  return {};
}

/** Section Management (Task 5 §5) — move-up/down instead of drag-and-drop, per the task's explicit "reliable mobile alternative" instruction. */
export function SectionManager({ sections, selectedIndex, onSelect, onChange }: SectionManagerProps) {
  const [showAddMenu, setShowAddMenu] = useState(false);

  function handleMove(index: number, direction: "up" | "down") {
    onChange(moveItem(sections, index, direction));
    onSelect(direction === "up" ? index - 1 : index + 1);
  }

  function handleToggleHidden(index: number) {
    onChange(sections.map((s, i) => (i === index ? { ...s, hidden: !s.hidden } : s)));
  }

  function handleDuplicate(index: number) {
    const copy = { ...sections[index], props: { ...sections[index].props } };
    const next = [...sections.slice(0, index + 1), copy, ...sections.slice(index + 1)];
    onChange(next);
    onSelect(index + 1);
  }

  function handleRemove(index: number) {
    if (!confirm(`Remove this ${SECTION_LABELS[sections[index].type] ?? sections[index].type} section? This can't be undone from here (use Undo).`)) return;
    onChange(sections.filter((_, i) => i !== index));
    onSelect(-1);
  }

  function handleAdd(type: string) {
    onChange([...sections, { type, props: defaultPropsForType(type) }]);
    setShowAddMenu(false);
    onSelect(sections.length);
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {sections.map((section, index) => {
          const selected = selectedIndex === index;
          return (
            <li
              key={index}
              className={`flex items-center gap-2 rounded-xl border p-2.5 transition ${
                selected ? "border-[#B97824] bg-[#FFF8ED]" : "border-[#E7DDCF] bg-white"
              } ${section.hidden ? "opacity-50" : ""}`}
            >
              <button type="button" onClick={() => onSelect(index)} className="flex-1 truncate text-left text-sm font-bold text-[#171512]">
                {SECTION_LABELS[section.type] ?? section.type}
                {section.hidden && <span className="ml-2 text-xs font-normal text-[#8A7D6C]">(hidden)</span>}
              </button>
              <div className="flex shrink-0 items-center gap-0.5">
                <IconButton label="Move up" onClick={() => handleMove(index, "up")} disabled={index === 0}>
                  <ChevronUp className="h-4 w-4" aria-hidden="true" />
                </IconButton>
                <IconButton label="Move down" onClick={() => handleMove(index, "down")} disabled={index === sections.length - 1}>
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                </IconButton>
                <IconButton label={section.hidden ? "Show section" : "Hide section"} onClick={() => handleToggleHidden(index)}>
                  {section.hidden ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                </IconButton>
                <IconButton label="Duplicate section" onClick={() => handleDuplicate(index)}>
                  <Copy className="h-4 w-4" aria-hidden="true" />
                </IconButton>
                <IconButton label="Remove section" onClick={() => handleRemove(index)} danger>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </IconButton>
              </div>
            </li>
          );
        })}
      </ul>

      {showAddMenu ? (
        <div className="rounded-xl border border-[#E7DDCF] bg-white p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#9A6A2F]">Add a section</p>
            <button type="button" onClick={() => setShowAddMenu(false)} aria-label="Close" className="text-[#8A7D6C]">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {ADDABLE_SECTION_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => handleAdd(type)}
                className="rounded-lg border border-[#E7DDCF] px-2.5 py-2 text-left text-xs font-semibold text-[#171512] hover:border-[#B97824]"
              >
                {SECTION_LABELS[type] ?? type}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAddMenu(true)}
          className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-[#E7DDCF] text-sm font-bold text-[#A9681F]"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add Section
        </button>
      )}
    </div>
  );
}

function IconButton({
  children,
  label,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex h-8 w-8 items-center justify-center rounded-full transition disabled:opacity-30 ${
        danger ? "text-red-600 hover:bg-red-50" : "text-[#756B5D] hover:bg-[#F7F0E5]"
      }`}
    >
      {children}
    </button>
  );
}
