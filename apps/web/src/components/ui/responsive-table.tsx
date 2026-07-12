import type { ReactNode } from "react";

/** Wraps a <table> with its own horizontal scroll, so a wide table never forces the whole page to scroll sideways. */
export function ResponsiveTable({ children, minWidth = 560 }: { children: ReactNode; minWidth?: number }) {
  return (
    <div className="w-full overflow-hidden rounded-2xl border border-[#E7DDCF] bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm" style={{ minWidth }}>
          {children}
        </table>
      </div>
    </div>
  );
}
