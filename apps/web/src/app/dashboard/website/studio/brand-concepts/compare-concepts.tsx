import type { PreparedConcept } from "./concept-data";

const ROWS: Array<[label: string, key: keyof PreparedConcept]> = [
  ["Business Style", "businessStyle"],
  ["Best For", "bestFor"],
  ["Typography Style", "typography"],
  ["Button Style", "buttonStyle"],
  ["Navigation Style", "navigationStyle"],
  ["Product Card Style", "productCardStyle"],
  ["Animation Style", "animationStyle"],
];

export function CompareConcepts({ concepts, labels }: { concepts: PreparedConcept[]; labels: string[] }) {
  return (
    <div className="rounded-2xl border border-[#E7DDCF] bg-[#FBF7F1] p-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-separate border-spacing-0 text-left text-xs">
          <thead>
            <tr>
              <th className="w-32 pb-3 pr-3 text-[10px] font-bold uppercase tracking-[0.08em] text-[#9A6A2F]" />
              {concepts.map((concept, index) => (
                <th key={concept.id} className="pb-3 pr-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#9A6A2F]">{labels[index]}</p>
                  <p className="mt-0.5 text-sm font-bold text-[#171512]">{concept.name}</p>
                  <div className="mt-1.5 flex gap-1">
                    {(["primary", "secondary", "accent"] as const).map((key) => (
                      <span key={key} className="h-4 w-4 rounded-full border border-[#E7DDCF]" style={{ backgroundColor: concept.colors[key] }} />
                    ))}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([label, key]) => (
              <tr key={key} className="border-t border-[#EEE5D9]">
                <td className="py-2.5 pr-3 text-[11px] font-bold text-[#756B5D]">{label}</td>
                {concepts.map((concept) => (
                  <td key={concept.id} className="py-2.5 pr-3 text-[#2A251F]">
                    {String(concept[key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
