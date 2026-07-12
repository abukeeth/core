export function FilterPills<T extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  labels?: Partial<Record<T, string>>;
}) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`min-h-9 shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition ${
            value === option ? "bg-[#171512] text-white" : "border border-[#E7DDCF] bg-white text-[#756B5D]"
          }`}
        >
          {labels?.[option] ?? (option || "All")}
        </button>
      ))}
    </div>
  );
}
