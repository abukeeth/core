import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

// jsdom doesn't implement matchMedia — stubbed globally so any component
// using it (e.g. a prefers-reduced-motion check) doesn't need its own
// per-test-file mock. Defaults to "no match"; tests needing a specific
// match can override window.matchMedia locally.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList;
}

// jsdom doesn't implement ResizeObserver — stubbed globally as a no-op so
// components that measure their own size (e.g. an animated-height wrapper)
// don't need a per-test-file mock. Tests asserting on measured dimensions
// should stub a real implementation locally.
if (typeof window !== "undefined" && !window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
