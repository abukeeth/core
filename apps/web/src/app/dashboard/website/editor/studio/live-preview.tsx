"use client";

import { useEffect, useRef, useState } from "react";
import { Laptop, Loader2, Maximize2, Smartphone, Tablet, X } from "lucide-react";
import { renderDraftPreview, type WebsiteSiteDefinition } from "@/lib/api";

type Viewport = "mobile" | "tablet" | "desktop";

const FRAME_WIDTH: Record<Viewport, string> = {
  mobile: "390px",
  tablet: "768px",
  desktop: "100%",
};

const DEBOUNCE_MS = 350;

export function LivePreview({ siteId, definition, activePath }: { siteId: string; definition: WebsiteSiteDefinition; activePath: string }) {
  const [viewport, setViewport] = useState<Viewport>("mobile");
  const [fullscreen, setFullscreen] = useState(false);
  const [html, setHtml] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    let cancelled = false;

    timerRef.current = setTimeout(() => {
      setLoading(true);
      renderDraftPreview(siteId, definition, activePath)
        .then(({ html: rendered }) => {
          if (cancelled) return;
          setHtml(rendered);
          setError(null);
        })
        .catch((err) => {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : "Preview failed to render");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [siteId, definition, activePath]);

  const frame = (
    <div className="relative flex flex-col overflow-hidden rounded-2xl border border-[#E7DDCF] bg-[#FBF7F1]">
      {loading && (
        <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-xs font-bold text-[#756B5D] shadow">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          Updating…
        </div>
      )}
      {error ? (
        <div className="flex min-h-[400px] items-center justify-center p-6 text-center text-sm text-red-600">{error}</div>
      ) : (
        <iframe title="Live storefront preview" srcDoc={html} className="h-[70vh] min-h-[500px] w-full border-0 bg-white" sandbox="allow-forms allow-scripts allow-same-origin" />
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-full border border-[#E7DDCF] bg-white p-1">
          <ViewportButton icon={Smartphone} label="Mobile" active={viewport === "mobile"} onClick={() => setViewport("mobile")} />
          <ViewportButton icon={Tablet} label="Tablet" active={viewport === "tablet"} onClick={() => setViewport("tablet")} />
          <ViewportButton icon={Laptop} label="Desktop" active={viewport === "desktop"} onClick={() => setViewport("desktop")} />
        </div>
        <button
          type="button"
          onClick={() => setFullscreen(true)}
          className="flex min-h-9 items-center gap-1.5 rounded-full border border-[#E7DDCF] bg-white px-3 text-xs font-bold text-[#171512]"
        >
          <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
          Fullscreen
        </button>
      </div>

      <div style={{ width: FRAME_WIDTH[viewport], maxWidth: "100%" }} className="mx-auto w-full transition-[width] duration-200">
        {frame}
      </div>

      {fullscreen && (
        <div className="fixed inset-0 z-[80] flex flex-col bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Fullscreen live preview">
          <div className="flex items-center justify-between pb-3">
            <p className="text-sm font-bold text-white">Live Preview</p>
            <button type="button" onClick={() => setFullscreen(false)} aria-label="Close fullscreen preview" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden rounded-2xl bg-white">
            <iframe title="Live storefront preview (fullscreen)" srcDoc={html} className="h-full w-full border-0" sandbox="allow-forms allow-scripts allow-same-origin" />
          </div>
        </div>
      )}
    </div>
  );
}

function ViewportButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof Smartphone;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-bold transition ${active ? "bg-[#171512] text-white" : "text-[#756B5D]"}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
