"use client";

import type { SiteSectionBlock } from "@/lib/api";
import { DynamicFieldEditor } from "../dynamic-field-editor";
import { SECTION_FIELD_DEFS, SECTION_LABELS } from "../section-fields";

export function SectionSettingsPanel({ section, onChange }: { section: SiteSectionBlock; onChange: (next: SiteSectionBlock) => void }) {
  const fields = SECTION_FIELD_DEFS[section.type] ?? [];

  if (fields.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm font-bold text-[#171512]">{SECTION_LABELS[section.type] ?? section.type}</p>
        <p className="text-sm text-[#756B5D]">
          This section has no editable text of its own — its content comes from your live menu or restaurant profile.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-bold text-[#171512]">{SECTION_LABELS[section.type] ?? section.type}</p>
      <DynamicFieldEditor
        fields={fields}
        values={section.props}
        onChange={(key, value) => {
          const nextProps = { ...section.props, [key]: value };
          if (value === undefined) delete nextProps[key];
          onChange({ ...section, props: nextProps });
        }}
      />
    </div>
  );
}
