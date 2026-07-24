import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ServiceWorkerRegistrar } from "./service-worker-registrar";

const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");

afterEach(() => {
  if (originalDescriptor) {
    Object.defineProperty(navigator, "serviceWorker", originalDescriptor);
  } else {
    // @ts-expect-error jsdom has no serviceWorker by default; remove our stub.
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;
  }
});

describe("ServiceWorkerRegistrar", () => {
  it("registers /sw.js when service workers are supported", () => {
    const register = vi.fn().mockResolvedValue({});
    Object.defineProperty(navigator, "serviceWorker", { value: { register }, configurable: true });

    const { container } = render(<ServiceWorkerRegistrar />);

    expect(register).toHaveBeenCalledWith("/sw.js", expect.objectContaining({ scope: "/" }));
    expect(container).toBeEmptyDOMElement();
  });

  it("no-ops (renders nothing, doesn't throw) when service workers are unavailable", () => {
    // @ts-expect-error force the unsupported case.
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;

    const { container } = render(<ServiceWorkerRegistrar />);

    expect(container).toBeEmptyDOMElement();
  });
});
