import type { ReactNode } from "react";
import { DashboardNav } from "@/components/dashboard-nav";

const MAX_WIDTH_CLASS = {
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
} as const;

export type PageShellMaxWidth = keyof typeof MAX_WIDTH_CLASS;

/**
 * Standard owner-dashboard page shell: warm background, DashboardNav,
 * bottom padding reserved for the fixed mobile tab bar, horizontal
 * overflow guard. Every dashboard page should render inside this.
 */
export function PageShell({ children, maxWidth = "5xl" }: { children: ReactNode; maxWidth?: PageShellMaxWidth }) {
  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[#F7F0E5] px-4 pb-28 pt-5 text-[#171512] sm:px-6 lg:p-10">
      <div className={`mx-auto flex w-full ${MAX_WIDTH_CLASS[maxWidth]} flex-col gap-6`}>
        <DashboardNav />
        {children}
      </div>
    </div>
  );
}
