export type ImportSourceId =
  | "image"
  | "pdf"
  | "spreadsheet"
  | "website"
  | "google_maps"
  | "doordash"
  | "uber_eats"
  | "grubhub"
  | "toast"
  | "clover"
  | "square"
  | "spoton"
  | "revel";

/**
 * Each source renders as its own brand-colored tile + glyph, the same way
 * these companies present their own app icons — not a generic beige square.
 * These are original, simplified marks built to evoke each brand's real
 * color and shape language (not reproductions of trademarked logo files —
 * no internet access in this environment to source official assets).
 */
export function SourceIcon({ id, className = "h-11 w-11" }: { id: ImportSourceId; className?: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  switch (id) {
    case "image":
      return (
        <div className={`${className} flex items-center justify-center rounded-2xl bg-[#F4E6D1] text-[#9A5F17]`}>
          <svg viewBox="0 0 24 24" className="h-[55%] w-[55%]" {...common}>
            <rect x="3" y="5" width="18" height="14" rx="3" />
            <circle cx="9" cy="10" r="2" />
            <path d="m5 17 5-5 3 3 2-2 4 4" />
          </svg>
        </div>
      );
    case "pdf":
      return (
        <div className={`${className} flex items-center justify-center rounded-2xl bg-red-50 text-red-600`}>
          <svg viewBox="0 0 24 24" className="h-[55%] w-[55%]" {...common}>
            <path d="M6 3h9l3 3v15H6z" />
            <path d="M15 3v4h4M9 12h6M9 16h6" />
          </svg>
        </div>
      );
    case "spreadsheet":
      return (
        <div className={`${className} flex items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700`}>
          <svg viewBox="0 0 24 24" className="h-[55%] w-[55%]" {...common}>
            <rect x="4" y="3" width="16" height="18" rx="2" />
            <path d="M4 9h16M9 9v12M15 9v12M4 15h16" />
          </svg>
        </div>
      );
    case "website":
      return (
        <div className={`${className} flex items-center justify-center rounded-2xl bg-[#F4E6D1] text-[#9A5F17]`}>
          <svg viewBox="0 0 24 24" className="h-[55%] w-[55%]" {...common}>
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
          </svg>
        </div>
      );
    case "google_maps":
      return (
        <div className={`${className} flex items-center justify-center rounded-2xl bg-[#FCE8E6]`}>
          <svg viewBox="0 0 24 24" className="h-[60%] w-[60%]">
            <path d="M12 2C7.6 2 4 5.6 4 10c0 5.8 8 12 8 12s8-6.2 8-12c0-4.4-3.6-8-8-8Z" fill="#EA4335" />
            <circle cx="12" cy="10" r="3.4" fill="#FFFFFF" />
            <circle cx="12" cy="10" r="2" fill="#4285F4" />
          </svg>
        </div>
      );
    case "doordash":
      return (
        <div className={`${className} flex items-center justify-center rounded-2xl bg-[#EB1700]`}>
          <svg viewBox="0 0 24 24" className="h-[52%] w-[52%]" fill="#FFFFFF">
            <path d="M3 7.5C3 6.7 3.7 6 4.5 6h9c4 0 7 2.6 7 6s-3 6-7 6H8.6a1 1 0 0 1-.7-1.7l2.9-2.8H13c1.7 0 2.9-.7 2.9-1.5S14.7 8.5 13 8.5H4.5C3.7 8.5 3 7.8 3 7.5Z" />
          </svg>
        </div>
      );
    case "uber_eats":
      return (
        <div className={`${className} flex items-center justify-center rounded-2xl bg-[#06C167]`}>
          <svg viewBox="0 0 24 24" className="h-[52%] w-[52%]" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9a6 6 0 0 1 12 0v9H6z" />
            <path d="M9 13h6" />
          </svg>
        </div>
      );
    case "grubhub":
      return (
        <div className={`${className} flex items-center justify-center rounded-2xl bg-[#F63440]`}>
          <svg viewBox="0 0 24 24" className="h-[52%] w-[52%]" fill="#FFFFFF">
            <circle cx="7" cy="7" r="2.3" />
            <circle cx="12" cy="5" r="2.3" />
            <circle cx="17" cy="7" r="2.3" />
            <path d="M4 11h16c0 4.4-3.6 8-8 8s-8-3.6-8-8Z" />
          </svg>
        </div>
      );
    case "toast":
      return (
        <div className={`${className} flex items-center justify-center rounded-2xl bg-[#FF4C00]`}>
          <svg viewBox="0 0 24 24" className="h-[52%] w-[52%]" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="4" width="16" height="16" rx="4" />
            <path d="M8 12h8M8 16h5" />
          </svg>
        </div>
      );
    case "clover":
      return (
        <div className={`${className} flex items-center justify-center rounded-2xl bg-[#00A650]`}>
          <svg viewBox="0 0 24 24" className="h-[55%] w-[55%]" fill="#FFFFFF">
            <circle cx="8.5" cy="8.5" r="3.5" />
            <circle cx="15.5" cy="8.5" r="3.5" />
            <circle cx="8.5" cy="15.5" r="3.5" />
            <circle cx="15.5" cy="15.5" r="3.5" />
          </svg>
        </div>
      );
    case "square":
      return (
        <div className={`${className} flex items-center justify-center rounded-2xl bg-[#171512]`}>
          <svg viewBox="0 0 24 24" className="h-[46%] w-[46%]" fill="none" stroke="#FFFFFF" strokeWidth="2.4">
            <rect x="4" y="4" width="16" height="16" rx="4" />
          </svg>
        </div>
      );
    case "spoton":
      return (
        <div className={`${className} flex items-center justify-center rounded-2xl bg-[#00303C]`}>
          <svg viewBox="0 0 24 24" className="h-[52%] w-[52%]" fill="none" stroke="#3DDC97" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2C7.6 2 4 5.6 4 10c0 5.8 8 12 8 12s8-6.2 8-12c0-4.4-3.6-8-8-8Z" />
            <circle cx="12" cy="10" r="2.5" fill="#3DDC97" stroke="none" />
          </svg>
        </div>
      );
    case "revel":
      return (
        <div className={`${className} flex items-center justify-center rounded-2xl bg-[#1B75BC]`}>
          <svg viewBox="0 0 24 24" className="h-[50%] w-[50%]" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M9 8h3.5a2.5 2.5 0 0 1 0 5H9V8Zm0 5 4 4" />
          </svg>
        </div>
      );
  }
}
