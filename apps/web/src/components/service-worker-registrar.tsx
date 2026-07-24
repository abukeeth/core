"use client";

import { useEffect } from "react";

/**
 * Registers the offline service worker (public/sw.js) once on the client.
 * No-ops where service workers aren't available (SSR, unsupported browsers,
 * insecure/non-HTTPS origins), so it's safe to mount app-wide.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const register = () => {
      void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined);
    };
    // Register after load so SW installation never competes with first paint.
    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
