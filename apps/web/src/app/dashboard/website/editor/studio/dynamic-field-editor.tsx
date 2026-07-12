"use client";

import { Plus, Trash2 } from "lucide-react";
import type { FieldDef } from "./section-fields";

const INPUT_CLASS = "min-h-11 w-full rounded-xl border border-[#E7DDCF] bg-white px-3 text-sm text-[#171512] outline-none focus:border-[#B97824]";
const LABEL_CLASS = "flex flex-col gap-1.5 text-sm font-semibold text-[#171512]";

function readValue(props: Record<string, unknown>, field: FieldDef): unknown {
  return props[field.key];
}

/** Renders one input per FieldDef and calls back with the raw value on every change — the section-settings panel owns debouncing/persistence, this is purely presentational + type coercion. */
export function DynamicFieldEditor({
  fields,
  values,
  onChange,
}: {
  fields: FieldDef[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {fields.map((field) => (
        <FieldInput key={field.key} field={field} value={readValue(values, field)} onChange={(v) => onChange(field.key, v)} />
      ))}
    </div>
  );
}

function FieldInput({ field, value, onChange }: { field: FieldDef; value: unknown; onChange: (value: unknown) => void }) {
  if (field.kind === "boolean") {
    return (
      <label className="flex items-center justify-between gap-3 text-sm font-semibold text-[#171512]">
        {field.label}
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(value)}
          onClick={() => onChange(!value)}
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${value ? "bg-[#B97824]" : "bg-[#E7DDCF]"}`}
        >
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${value ? "left-6" : "left-1"}`} />
        </button>
      </label>
    );
  }

  if (field.kind === "select") {
    return (
      <label className={LABEL_CLASS}>
        {field.label}
        <select value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} className={INPUT_CLASS}>
          <option value="">Default</option>
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.kind === "textarea") {
    return (
      <label className={LABEL_CLASS}>
        {field.label}
        <textarea
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder={field.placeholder}
          className={`${INPUT_CLASS} min-h-20 py-2`}
        />
      </label>
    );
  }

  if (field.kind === "number") {
    return (
      <label className={LABEL_CLASS}>
        {field.label}
        <input
          type="number"
          value={typeof value === "number" ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          className={INPUT_CLASS}
        />
      </label>
    );
  }

  if (field.kind === "list") {
    const items = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-[#171512]">{field.label}</p>
        <div className="flex flex-col gap-3">
          {items.map((item, index) => (
            <div key={index} className="flex flex-col gap-2 rounded-xl border border-[#E7DDCF] bg-[#FBF7F1] p-3">
              {field.itemFields?.map((subField) => (
                <FieldInput
                  key={subField.key}
                  field={subField}
                  value={item[subField.key]}
                  onChange={(v) => {
                    const next = items.map((it, i) => (i === index ? { ...it, [subField.key]: v } : it));
                    onChange(next);
                  }}
                />
              ))}
              <button
                type="button"
                onClick={() => onChange(items.filter((_, i) => i !== index))}
                className="flex items-center gap-1.5 self-start rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold text-red-700"
              >
                <Trash2 className="h-3 w-3" aria-hidden="true" />
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onChange([...items, {}])}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#E7DDCF] py-2 text-sm font-bold text-[#A9681F]"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add
        </button>
      </div>
    );
  }

  // text | url
  return (
    <label className={LABEL_CLASS}>
      {field.label}
      <input
        type={field.kind === "url" ? "url" : "text"}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        className={INPUT_CLASS}
      />
    </label>
  );
}
