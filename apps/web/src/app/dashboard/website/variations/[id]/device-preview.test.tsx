import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetPreviewToken = vi.fn();
vi.mock("@/lib/api", () => ({
  getPreviewToken: (...args: unknown[]) => mockGetPreviewToken(...args),
}));

import { DevicePreview } from "./device-preview";

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: width });
}

/**
 * jsdom doesn't perform a real network navigation when an iframe's `src`
 * changes, but it does give the iframe a real, writable `contentDocument` —
 * writing into it and firing `load` is enough to exercise handleIframeLoad's
 * actual DOM-reading logic (error marker detection, click interception)
 * without needing a live browser.
 */
function loadIframeWith(iframe: HTMLIFrameElement, bodyHtml: string, bodyAttrs = "") {
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(`<html><body ${bodyAttrs}>${bodyHtml}</body></html>`);
  doc.close();
  fireEvent.load(iframe);
}

function loadIframeWithError(iframe: HTMLIFrameElement, code: string, message: string) {
  loadIframeWith(iframe, `<p>${message}</p>`, `data-ordervora-preview-error="${code}"`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetPreviewToken.mockResolvedValue({ token: "tok-abc" });
  setViewportWidth(1280);
});

describe("DevicePreview — device defaults (§B)", () => {
  it("defaults to mobile on an iPhone-sized viewport (< 640px)", async () => {
    setViewportWidth(390);
    render(<DevicePreview siteId="site-1" variationId="v-1" />);

    await waitFor(() => expect(screen.getByTestId("device-preview-frame")).toHaveAttribute("data-device", "mobile"));
  });

  it("defaults to tablet on a tablet-sized viewport (640-1023px)", async () => {
    setViewportWidth(768);
    render(<DevicePreview siteId="site-1" variationId="v-1" />);

    await waitFor(() => expect(screen.getByTestId("device-preview-frame")).toHaveAttribute("data-device", "tablet"));
  });

  it("defaults to desktop on a desktop-sized viewport (>= 1024px)", async () => {
    setViewportWidth(1280);
    render(<DevicePreview siteId="site-1" variationId="v-1" />);

    await waitFor(() => expect(screen.getByTestId("device-preview-frame")).toHaveAttribute("data-device", "desktop"));
  });

  it("manual device selection overrides automatic detection, and survives a later resize", async () => {
    setViewportWidth(1280);
    render(<DevicePreview siteId="site-1" variationId="v-1" />);
    await waitFor(() => expect(screen.getByTestId("device-preview-frame")).toHaveAttribute("data-device", "desktop"));

    fireEvent.click(screen.getByRole("button", { name: "mobile" }));
    expect(screen.getByTestId("device-preview-frame")).toHaveAttribute("data-device", "mobile");

    // Simulate the viewport changing again (e.g. rotating a tablet) — the
    // manual choice must keep winning, not silently get overridden.
    act(() => {
      setViewportWidth(768);
      window.dispatchEvent(new Event("resize"));
    });
    expect(screen.getByTestId("device-preview-frame")).toHaveAttribute("data-device", "mobile");
  });

  it("actually changes the rendered frame's max-width per device, not just the active tab styling", async () => {
    render(<DevicePreview siteId="site-1" variationId="v-1" />);
    await waitFor(() => screen.getByTestId("device-preview-frame"));

    fireEvent.click(screen.getByRole("button", { name: "mobile" }));
    expect(screen.getByTestId("device-preview-frame")).toHaveStyle({ maxWidth: "390px" });

    fireEvent.click(screen.getByRole("button", { name: "tablet" }));
    expect(screen.getByTestId("device-preview-frame")).toHaveStyle({ maxWidth: "768px" });

    fireEvent.click(screen.getByRole("button", { name: "desktop" }));
    expect(screen.getByTestId("device-preview-frame")).toHaveStyle({ maxWidth: "1280px" });
  });

  it("hides the device switcher when hideDeviceSwitcher is set, for use as a compact grid thumbnail", async () => {
    render(<DevicePreview siteId="site-1" variationId="v-1" hideDeviceSwitcher />);
    await waitFor(() => screen.getByTestId("device-preview-frame"));

    expect(screen.queryByRole("button", { name: "mobile" })).not.toBeInTheDocument();
  });
});

describe("DevicePreview — preview URL construction", () => {
  it("builds the iframe src from the real token, variation, and current path", async () => {
    render(<DevicePreview siteId="site-1" variationId="v-42" />);

    await waitFor(() => {
      const iframe = document.querySelector("iframe");
      expect(iframe).toHaveAttribute("src", "/preview/tok-abc?variation=v-42&path=%2F");
    });
  });

  it("resets to the home path when switching to a different variation", async () => {
    const { rerender } = render(<DevicePreview siteId="site-1" variationId="v-1" />);
    await waitFor(() => document.querySelector("iframe"));

    rerender(<DevicePreview siteId="site-1" variationId="v-2" />);

    await waitFor(() => {
      const iframe = document.querySelector("iframe");
      expect(iframe).toHaveAttribute("src", "/preview/tok-abc?variation=v-2&path=%2F");
    });
  });
});

describe("DevicePreview — graceful error states (§K: raw 404 replaced by graceful error state)", () => {
  it("replaces the iframe with a polished error message when the preview response carries the error marker", async () => {
    render(<DevicePreview siteId="site-1" variationId="v-1" />);
    const iframe = await waitFor(() => {
      const el = document.querySelector("iframe");
      if (!el) throw new Error("iframe not rendered yet");
      return el;
    });

    loadIframeWithError(iframe, "site-not-found", "This preview isn't available right now.");

    await waitFor(() => {
      expect(screen.getByText("This preview isn't available right now.")).toBeInTheDocument();
      expect(document.querySelector("iframe")).not.toBeInTheDocument();
    });
  });

  it("lets the owner recover from an error state via 'Back to home', returning to the real iframe", async () => {
    render(<DevicePreview siteId="site-1" variationId="v-1" />);
    const iframe = await waitFor(() => {
      const el = document.querySelector("iframe");
      if (!el) throw new Error("iframe not rendered yet");
      return el;
    });

    loadIframeWithError(iframe, "page-not-found", "This preview isn't available right now.");
    await waitFor(() => screen.getByText(/preview isn't available/));

    fireEvent.click(screen.getByRole("button", { name: "Back to home" }));

    await waitFor(() => {
      const restoredIframe = document.querySelector("iframe");
      expect(restoredIframe).toHaveAttribute("src", "/preview/tok-abc?variation=v-1&path=%2F");
    });
  });

  it("clears a previous error and shows the real preview again once a later load succeeds cleanly", async () => {
    render(<DevicePreview siteId="site-1" variationId="v-1" />);
    let iframe = await waitFor(() => {
      const el = document.querySelector("iframe");
      if (!el) throw new Error("iframe not rendered yet");
      return el;
    });

    loadIframeWithError(iframe, "site-not-found", "This preview isn't available right now.");
    await waitFor(() => screen.getByText(/preview isn't available/));

    fireEvent.click(screen.getByRole("button", { name: "Back to home" }));
    iframe = await waitFor(() => {
      const el = document.querySelector("iframe");
      if (!el) throw new Error("iframe not re-rendered after recovering from error");
      return el;
    });
    fireEvent.load(iframe);

    await waitFor(() => {
      expect(screen.queryByText(/preview isn't available/)).not.toBeInTheDocument();
      expect(document.querySelector("iframe")).toBeInTheDocument();
    });
  });
});

describe("DevicePreview — internal navigation stays inside the preview context (§K/§18)", () => {
  it("intercepts a root-relative internal link click and updates the iframe's path instead of navigating away", async () => {
    render(<DevicePreview siteId="site-1" variationId="v-1" />);
    const iframe = await waitFor(() => {
      const el = document.querySelector("iframe");
      if (!el) throw new Error("iframe not rendered yet");
      return el;
    });

    loadIframeWith(iframe, '<a href="/menu">Menu</a>');
    const link = iframe.contentDocument!.querySelector("a")!;
    fireEvent.click(link);

    await waitFor(() => {
      expect(document.querySelector("iframe")).toHaveAttribute("src", "/preview/tok-abc?variation=v-1&path=%2Fmenu");
    });
  });

  it("does not intercept absolute/external links (Cart, Order, tel:, mailto:)", async () => {
    render(<DevicePreview siteId="site-1" variationId="v-1" />);
    const iframe = await waitFor(() => {
      const el = document.querySelector("iframe");
      if (!el) throw new Error("iframe not rendered yet");
      return el;
    });

    loadIframeWith(
      iframe,
      '<a href="https://example.com/cart" id="cart">Cart</a><a href="tel:+15555550100" id="tel">Call</a>',
    );
    const cartLink = iframe.contentDocument!.querySelector("#cart") as HTMLAnchorElement;
    const telLink = iframe.contentDocument!.querySelector("#tel") as HTMLAnchorElement;
    fireEvent.click(cartLink);
    fireEvent.click(telLink);

    // Neither click is a root-relative path, so the preview path/src is unchanged.
    expect(document.querySelector("iframe")).toHaveAttribute("src", "/preview/tok-abc?variation=v-1&path=%2F");
  });
});
