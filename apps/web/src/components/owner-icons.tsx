/* Shared line-icon set for the OrderVora owner dashboard (design system V2). */

export type IconName =
  | "menu" | "search" | "bell" | "receipt" | "chevron" | "bag" | "bike"
  | "sparkles" | "plus" | "coupon" | "share" | "home" | "orders" | "products"
  | "customers" | "more" | "analytics" | "import" | "arrow" | "kds" | "website"
  | "staff" | "settings" | "filter" | "clock" | "back" | "check";

export function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const paths: Record<IconName, React.ReactNode> = {
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3-3" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h5" /></>,
    chevron: <path d="m9 6 6 6-6 6" />,
    bag: <><path d="M6 8h12l-1 12H7L6 8Z" /><path d="M9 8a3 3 0 0 1 6 0" /></>,
    bike: <><circle cx="6" cy="17" r="3" /><circle cx="18" cy="17" r="3" /><path d="M6 17 10 7h5l2 5M9 17h6" /></>,
    sparkles: <><path d="M12 3.5 13.7 8.3 18.5 10 13.7 11.7 12 16.5 10.3 11.7 5.5 10 10.3 8.3 12 3.5Z" /><path d="M18.5 14.5 19.3 16.7 21.5 17.5 19.3 18.3 18.5 20.5 17.7 18.3 15.5 17.5 17.7 16.7 18.5 14.5Z" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    coupon: <><path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8Z" /><path d="M14 6v12" /></>,
    share: <><path d="M12 15V4M8 8l4-4 4 4" /><path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></>,
    home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></>,
    orders: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h6" /></>,
    products: <><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" /><path d="m3 8 9 5 9-5M12 13v8" /></>,
    customers: <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20c0-4 2.5-6 6-6s6 2 6 6M14 15c3.5 0 6 1.8 6 5" /></>,
    more: <><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></>,
    analytics: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
    import: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 20h14" /></>,
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    kds: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4M7 8h10M7 12h6" /></>,
    website: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>,
    staff: <><circle cx="12" cy="8" r="4" /><path d="M4 21c.5-5 3-7 8-7s7.5 2 8 7" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.5 4.5l2 2M17.5 17.5l2 2M2 12h3M19 12h3M4.5 19.5l2-2M17.5 6.5l2-2" /></>,
    filter: <path d="M4 6h16M7 12h10M10 18h4" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    back: <path d="M19 12H5M11 6l-6 6 6 6" />,
    check: <path d="M5 12.5 10 17l9-10" />,
  };
  return <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...common}>{paths[name]}</svg>;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "OV";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}
