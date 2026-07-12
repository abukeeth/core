"use client";

import { useEffect, useState } from "react";
import { getPreviewToken } from "@/lib/api";

const DEVICE_WIDTHS = { mobile: 390, tablet: 768, desktop: 1280 } as const;
type Device = keyof typeof DEVICE_WIDTHS;

/**
 * §18 Preview System — renders the actual shared renderer's output (not a
 * mock) inside an iframe pointed at /preview/:token, with a mobile/tablet/
 * desktop frame toggle. The token is short-lived and site-scoped; the
 * preview always reflects this specific variation via ?variation=.
 */
export function DevicePreview({ siteId, variationId }: { siteId: string; variationId: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [device, setDevice] = useState<Device>("desktop");

  useEffect(() => {
    let cancelled = false;
    getPreviewToken(siteId)
      .then(({ token: t }) => {
        if (!cancelled) setToken(t);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load preview");
      });
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  if (error) {
    return <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>;
  }
  if (!token) {
    return (
      <div className="flex h-[300px] w-full animate-pulse flex-col items-center justify-center gap-2 rounded-2xl bg-[#EEE5D9] sm:h-[600px]">
        <p className="text-sm font-semibold text-[#8A7D6C]">Loading preview…</p>
      </div>
    );
  }

  const src = `/preview/${token}?variation=${encodeURIComponent(variationId)}&path=${encodeURIComponent("/")}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        {(Object.keys(DEVICE_WIDTHS) as Device[]).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDevice(d)}
            className={`min-h-9 rounded-full border px-3 py-1 text-xs font-bold capitalize transition ${
              device === d ? "border-[#171512] bg-[#171512] text-white" : "border-[#E7DDCF] bg-white text-[#756B5D]"
            }`}
          >
            {d}
          </button>
        ))}
      </div>
      <div
        className="mx-auto w-full overflow-hidden rounded-2xl border border-[#E7DDCF] bg-white transition-[max-width]"
        style={{ maxWidth: DEVICE_WIDTHS[device] }}
      >
        <iframe src={src} title="Site preview" className="h-[300px] w-full border-0 sm:h-[600px]" />
      </div>
    </div>
  );
}
