import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
  padding = "default",
}: {
  children: ReactNode;
  className?: string;
  padding?: "default" | "compact" | "none";
}) {
  const paddingClass = padding === "none" ? "" : padding === "compact" ? "p-4 sm:p-5" : "p-5 sm:p-6";
  return (
    <section className={`rounded-3xl border border-[#E7DDCF] bg-white shadow-[0_12px_36px_rgba(48,39,27,0.04)] ${paddingClass} ${className}`}>
      {children}
    </section>
  );
}
