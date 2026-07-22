"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Mounts its children only once the wrapper approaches the viewport, then keeps
 * them mounted **permanently** — the observer disconnects on first intersection
 * and `mounted` never flips back to false. This is what lets the Storefront
 * Showcase hold three live storefront iframes without loading all three up
 * front, and without ever reloading one when the owner scrolls back to it.
 *
 * Environments without IntersectionObserver (jsdom, very old browsers) mount
 * immediately, so behavior degrades to "always rendered".
 */
export function LazyMount({
  children,
  rootMargin = "400px",
  className,
  placeholder,
}: {
  children: ReactNode;
  /** How far ahead of the viewport to begin mounting. */
  rootMargin?: string;
  className?: string;
  /** Shown until the children mount (e.g. a skeleton). */
  placeholder?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (mounted) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setMounted(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setMounted(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [mounted, rootMargin]);

  return (
    <div ref={ref} className={className} data-mounted={mounted ? "true" : "false"}>
      {mounted ? children : placeholder}
    </div>
  );
}
