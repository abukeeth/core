import "@testing-library/jest-dom/vitest";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LazyMount } from "./lazy-mount";

let observerCallback: IntersectionObserverCallback | null = null;
let disconnectCount = 0;

class MockIntersectionObserver {
  constructor(cb: IntersectionObserverCallback) {
    observerCallback = cb;
  }
  observe() {}
  disconnect() {
    disconnectCount += 1;
  }
  unobserve() {}
  takeRecords() {
    return [];
  }
}

beforeEach(() => {
  observerCallback = null;
  disconnectCount = 0;
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver as unknown as typeof IntersectionObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function intersect(isIntersecting: boolean) {
  act(() => {
    observerCallback?.([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver);
  });
}

describe("LazyMount (mount-once)", () => {
  it("does not render children until the wrapper approaches the viewport", () => {
    render(
      <LazyMount placeholder={<span>placeholder</span>}>
        <span>real-content</span>
      </LazyMount>,
    );
    expect(screen.getByText("placeholder")).toBeInTheDocument();
    expect(screen.queryByText("real-content")).not.toBeInTheDocument();
  });

  it("mounts the children once the wrapper intersects, and disconnects the observer", () => {
    render(
      <LazyMount placeholder={<span>placeholder</span>}>
        <span>real-content</span>
      </LazyMount>,
    );
    intersect(true);
    expect(screen.getByText("real-content")).toBeInTheDocument();
    expect(disconnectCount).toBeGreaterThan(0);
  });

  it("keeps children mounted permanently — scrolling back out never unmounts or reloads", () => {
    render(
      <LazyMount placeholder={<span>placeholder</span>}>
        <span>real-content</span>
      </LazyMount>,
    );
    intersect(true);
    expect(screen.getByText("real-content")).toBeInTheDocument();
    // Simulate scrolling the section back out of view.
    intersect(false);
    expect(screen.getByText("real-content")).toBeInTheDocument();
    expect(screen.queryByText("placeholder")).not.toBeInTheDocument();
  });
});
