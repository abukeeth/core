import { describe, expect, it } from "vitest";
import { escapeHtml, safeJsonLd } from "./html-escape";

describe("escapeHtml", () => {
  it("escapes all five HTML-significant characters", () => {
    expect(escapeHtml(`<script>alert('xss')&"quote"</script>`)).toBe(
      "&lt;script&gt;alert(&#39;xss&#39;)&amp;&quot;quote&quot;&lt;/script&gt;",
    );
  });

  it("leaves ordinary text untouched", () => {
    expect(escapeHtml("Handmade pasta, fresh daily.")).toBe("Handmade pasta, fresh daily.");
  });

  it("neutralizes an attribute-breakout attempt", () => {
    const malicious = `" onmouseover="alert(1)`;
    const escaped = escapeHtml(malicious);
    expect(escaped).not.toContain('"');
  });
});

describe("safeJsonLd", () => {
  it("escapes a </script> breakout sequence inside JSON-LD", () => {
    const result = safeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(result).not.toContain("</script>");
    expect(result).toContain("\\u003c");
  });

  it("produces valid JSON for ordinary data", () => {
    const result = safeJsonLd({ "@type": "Restaurant", name: "Trattoria Bella" });
    expect(JSON.parse(result)).toEqual({ "@type": "Restaurant", name: "Trattoria Bella" });
  });
});
