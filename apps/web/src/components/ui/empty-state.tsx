import type { ReactNode } from "react";

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[#E7DDCF] bg-[#FFFDF9] px-4 py-10 text-center">
      <p className="text-sm font-bold text-[#171512]">{title}</p>
      {description && <p className="max-w-sm text-sm text-[#756B5D]">{description}</p>}
      {action}
    </div>
  );
}
