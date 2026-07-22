"use client";

import { useEffect, useRef, useState } from "react";
import { getPreviewToken } from "@/lib/api";

const DEVICE_WIDTHS = { mobile: 390, tablet: 768, desktop: 1280 } as const;
type Device = keyof typeof DEVICE_WIDTHS;

function detectDevice(): Device {
  const width = window.innerWidth;
  if (width < 640) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

/**
 * §18 Preview System — renders the actual shared renderer's output (not a
 * mock) inside an iframe pointed at /preview/:token, with a mobile/tablet/
 * desktop frame toggle. The token is short-lived and site-scoped; the
 * preview always reflects this specific variation via ?variation=.
 *
 * Device default: a stable "desktop" on the very first render — server and
 * client must produce identical markup, and the server has no viewport to
 * know about — corrected to the real viewport in an effect right after
 * mount. A manual click always wins over auto-detection from then on,
 * including across a later window resize.
 *
 * Internal navigation: the renderer emits real root-relative page links
 * (components/chrome.ts's `<a href="/menu">`) — correct for how a real
 * domain resolves them, but by default those would navigate this iframe
 * straight to `{dashboard origin}/menu`, outside the /preview/:token
 * context entirely (not a real Next.js route — a raw 404). `/preview/*` is
 * proxied same-origin (next.config.ts), so this component can reach into
 * the iframe's own contentDocument and intercept those clicks, redirecting
 * them to a new `path=` on the *same* preview URL instead — without ever
 * touching the renderer's own deterministic output (still byte-identical
 * to what a real visit produces).
 */
export function DevicePreview({
  siteId,
  variationId,
  hideDeviceSwitcher = false,
  frameHeightClassName = "h-[300px] sm:h-[600px]",
  immersive = false,
}: {
  siteId: string;
  variationId: string;
  hideDeviceSwitcher?: boolean;
  /** Overridable so a compact comparison-grid thumbnail (variations/page.tsx) doesn't need the full single-preview page's height. */
  frameHeightClassName?: string;
  /**
   * Storefront Showcase mode: the preview fills its parent (flex-1, full
   * height) and reads edge-to-edge like a real website rather than a card
   * thumbnail. Desktop stays the default device on desktop; on a phone the
   * viewport auto-detects mobile. The owner can still switch devices.
   */
  immersive?: boolean;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoDevice, setAutoDevice] = useState<Device>("desktop");
  const [manualDevice, setManualDevice] = useState<Device | null>(null);
  const [path, setPath] = useState("/");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const device = manualDevice ?? autoDevice;

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

  useEffect(() => {
    // Real viewport is unknown at SSR time — this corrects the stable
    // "desktop" default to the real device right after mount, then keeps
    // following the viewport on resize until the owner manually picks one.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAutoDevice(detectDevice());
    function handleResize() {
      setAutoDevice(detectDevice());
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    // A new variation has its own definition/theme — a lingering error state
    // or path from the previous one would misrepresent this one.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPath("/");
    setPreviewError(null);
  }, [variationId]);

  function handleIframeLoad() {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let doc: Document | null = null;
    try {
      doc = iframe.contentDocument;
    } catch {
      return; // Cross-origin — shouldn't happen for a same-origin-proxied /preview/* src, but never throw over it.
    }
    if (!doc) return;

    const errorCode = doc.body?.dataset.ordervoraPreviewError;
    if (errorCode) {
      const message = doc.querySelector("p")?.textContent ?? "This preview isn't available right now.";
      setPreviewError(message);
      return;
    }
    setPreviewError(null);

    function onClick(event: MouseEvent) {
      const anchor = (event.target as HTMLElement | null)?.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      // Only intercept the renderer's own internal page links (root-
      // relative, e.g. "/menu") — external links (Cart/Order/Account,
      // which chrome.ts always emits as absolute URLs by design, plus
      // tel:/mailto:/maps links) behave normally.
      if (!href || !href.startsWith("/") || href.startsWith("//")) return;
      event.preventDefault();
      setPath(href);
    }

    doc.addEventListener("click", onClick);
  }

  // In immersive mode the frame fills the parent (flex-1) instead of a fixed
  // card height, so the storefront reads like a full website.
  const frameH = immersive ? "h-full" : frameHeightClassName;

  if (error) {
    return <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>;
  }
  if (!token) {
    return (
      <div className={`flex w-full animate-pulse flex-col items-center justify-center gap-2 rounded-2xl bg-[#EEE5D9] ${frameH}`}>
        <p className="text-sm font-semibold text-[#8A7D6C]">Loading preview…</p>
      </div>
    );
  }

  const src = `/preview/${token}?variation=${encodeURIComponent(variationId)}&path=${encodeURIComponent(path)}`;

  return (
    <div className={immersive ? "flex h-full flex-col gap-2" : "flex flex-col gap-3"}>
      {!hideDeviceSwitcher && (
        <div className={immersive ? "flex shrink-0 justify-center gap-2" : "flex gap-2"}>
          {(Object.keys(DEVICE_WIDTHS) as Device[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setManualDevice(d)}
              aria-pressed={device === d}
              className={`min-h-9 rounded-full border px-3 py-1 text-xs font-bold capitalize transition ${
                device === d ? "border-[#171512] bg-[#171512] text-white" : "border-[#E7DDCF] bg-white text-[#756B5D]"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      )}
      <div
        className={
          immersive
            ? "mx-auto flex w-full min-h-0 flex-1 overflow-hidden rounded-2xl bg-white shadow-[0_18px_50px_rgba(48,39,27,0.16)]"
            : "mx-auto w-full overflow-hidden rounded-2xl border border-[#E7DDCF] bg-white transition-[max-width]"
        }
        style={{ maxWidth: DEVICE_WIDTHS[device] }}
        data-testid="device-preview-frame"
        data-device={device}
      >
        {previewError ? (
          <div className={`flex w-full flex-col items-center justify-center gap-3 px-6 text-center ${frameH}`}>
            <p className="text-sm font-bold text-[#171512]">{previewError}</p>
            <button
              type="button"
              onClick={() => {
                setPreviewError(null);
                setPath("/");
              }}
              className="min-h-10 rounded-full border border-[#E7DDCF] bg-white px-4 text-xs font-bold text-[#171512]"
            >
              Back to home
            </button>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            src={src}
            title="Site preview"
            onLoad={handleIframeLoad}
            className={`w-full border-0 ${frameH}`}
          />
        )}
      </div>
    </div>
  );
}
