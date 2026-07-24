import Link from "next/link";

export interface LegalSection {
  heading: string;
  /** Each string is rendered as its own paragraph. */
  body: string[];
}

export interface LegalPageProps {
  title: string;
  /** Human-readable effective date, e.g. "July 24, 2026". */
  effectiveDate: string;
  intro: string[];
  sections: LegalSection[];
  /** Which legal page this is, so the cross-links can omit the current one. */
  current: "terms" | "privacy" | "refund";
}

const LEGAL_LINKS: { key: LegalPageProps["current"]; href: string; label: string }[] = [
  { key: "terms", href: "/terms", label: "Terms of Service" },
  { key: "privacy", href: "/privacy", label: "Privacy Policy" },
  { key: "refund", href: "/refund", label: "Refund Policy" },
];

/**
 * Shared chrome for the OrderVora legal pages. Deliberately includes a
 * prominent "template, not legal advice" notice: these documents are a starting
 * point for the operator to adapt with qualified counsel, never a substitute
 * for it. Bracketed placeholders (company legal name, contact, governing law)
 * must be filled before launch.
 */
export function LegalPage({ title, effectiveDate, intro, sections, current }: LegalPageProps) {
  return (
    <main className="min-h-full bg-[#FAF7F2] text-[#171512]">
      <header className="border-b border-[#E7DDCF] px-4 py-5 sm:px-6 lg:px-10">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href="/" className="text-xl font-bold tracking-tight text-[#B97824]">
            OrderVora
          </Link>
          <Link href="/" className="text-sm font-semibold text-[#756B5D] hover:text-[#171512]">
            ← Back to home
          </Link>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-10">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm font-semibold text-[#756B5D]">Last updated: {effectiveDate}</p>

        <div className="mt-6 rounded-2xl border border-[#E7DDCF] bg-[#FBEFD9] px-4 py-3 text-sm text-[#5C4A2A]">
          <strong>Template — not legal advice.</strong> This document is provided as a starting point and must be
          reviewed and adapted by qualified counsel before you rely on it. Bracketed items such as{" "}
          <code>[Company Legal Name]</code> and <code>[Governing-Law State]</code> must be completed.
        </div>

        {intro.map((paragraph, index) => (
          <p key={index} className="mt-5 leading-relaxed text-[#3A3428]">
            {paragraph}
          </p>
        ))}

        {sections.map((section, index) => (
          <section key={section.heading} className="mt-8">
            <h2 className="text-xl font-bold">
              {index + 1}. {section.heading}
            </h2>
            {section.body.map((paragraph, paragraphIndex) => (
              <p key={paragraphIndex} className="mt-3 leading-relaxed text-[#3A3428]">
                {paragraph}
              </p>
            ))}
          </section>
        ))}

        <nav className="mt-12 flex flex-wrap gap-4 border-t border-[#E7DDCF] pt-6 text-sm font-semibold">
          {LEGAL_LINKS.filter((link) => link.key !== current).map((link) => (
            <Link key={link.key} href={link.href} className="text-[#B97824] hover:text-[#171512]">
              {link.label}
            </Link>
          ))}
        </nav>
      </article>
    </main>
  );
}
