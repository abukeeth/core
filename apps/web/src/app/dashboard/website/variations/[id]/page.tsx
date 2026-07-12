import { notFound } from "next/navigation";
import { PageShell } from "@/components/ui";
import type { SiteVersion, WebsiteSite } from "@/lib/api";
import { serverFetch } from "@/lib/server-api";
import { DevicePreview } from "./device-preview";

function formatPrice(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * §18 Preview System: the device-toggle iframe below renders this
 * variation through the actual shared renderer (renderer/render-page.ts),
 * the same one static generation uses at publish time — not a mock. The
 * structured breakdown underneath is supplementary: it lets an owner
 * inspect exactly what data drove the render without digging through
 * devtools.
 */
export default async function VariationPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const siteResult = await serverFetch<{ site: WebsiteSite }>("/api/sites/me");
  if (!siteResult.ok) notFound();
  const { site } = siteResult.data;

  const versionResult = await serverFetch<{ version: SiteVersion }>(`/api/sites/${site.id}/versions/${id}`);
  if (!versionResult.ok) notFound();
  const { version } = versionResult.data;
  const definition = version.definition;

  return (
    <PageShell maxWidth="3xl">
        <div className="flex flex-col gap-6 rounded-3xl border border-[#E7DDCF] bg-white p-5 shadow-[0_12px_36px_rgba(48,39,27,0.04)] sm:p-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A6A2F]">FULL PREVIEW</p>
            <h1 className="mt-1 text-2xl font-bold">{definition.restaurantName}</h1>
            <p className="mt-1 text-sm text-[#756B5D]">
              {version.styleFamily} · {definition.cuisine} · {definition.businessType}
            </p>
            <p className="mt-2 text-sm italic text-[#756B5D]">&ldquo;{definition.tagline}&rdquo;</p>
          </div>

          <DevicePreview siteId={site.id} variationId={version.id} />

          <div className="flex items-center gap-2 text-xs text-[#8A7D6C]">
            <span
              className="h-5 w-5 shrink-0 rounded-full border border-[#E7DDCF]"
              style={{ backgroundColor: definition.colorSeed }}
            />
            <span>
              {definition.typography.display} / {definition.typography.body}
            </span>
          </div>

          {definition.pages.map((page) => (
            <div key={page.slug} className="flex flex-col gap-2 border-t border-[#EEE5D9] pt-4">
              <h2 className="text-sm font-bold">{page.title}</h2>
              <p className="text-xs text-[#8A7D6C]">{page.metaDescription}</p>
              <ul className="flex flex-col gap-2 pl-4 text-sm text-[#2A251F]">
                {page.sections.map((section, i) => (
                  <li key={`${section.type}-${i}`}>
                    <span className="font-mono text-xs uppercase text-[#8A7D6C]">{section.type}</span>
                    {typeof section.props.headline === "string" && <span> — {section.props.headline}</span>}
                    {typeof section.props.story === "string" && <span> — {section.props.story}</span>}
                    {Array.isArray(section.props.categories) && (
                      <ul className="pl-4">
                        {(section.props.categories as { name: string; items: { name: string; priceCents: number }[] }[]).map((category) => (
                          <li key={category.name}>
                            {category.name}:{" "}
                            {category.items.map((item) => `${item.name} ($${formatPrice(item.priceCents)})`).join(", ")}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
    </PageShell>
  );
}
