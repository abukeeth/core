/**
 * Every string interpolated into a rendered page template must go through
 * this — restaurant names, LLM-generated copy, menu item descriptions, and
 * owner-editable text are all untrusted input (§27: "all owner-editable
 * text rendered as text, never HTML"). Never interpolate raw strings
 * directly into template literals in this renderer.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** For text placed inside an HTML attribute value (quotes matter more there). */
export function escapeAttr(value: string): string {
  return escapeHtml(value);
}

/** JSON-LD is embedded via <script type="application/ld+json">; must escape </script> breakout sequences. */
export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
