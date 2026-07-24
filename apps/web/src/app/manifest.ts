import type { MetadataRoute } from "next";

/**
 * Web App Manifest — makes OrderVora installable as a PWA. The primary driver
 * is the Kitchen Display: a kitchen tablet can install the dashboard to the
 * home screen and run it full-screen (`standalone`), and — paired with the
 * offline service worker (public/sw.js) — the KDS shell keeps loading through a
 * network blip instead of showing the browser's dinosaur.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OrderVora",
    short_name: "OrderVora",
    description: "OrderVora — ordering, kitchen display, and delivery for your restaurant.",
    start_url: "/dashboard/kitchen",
    display: "standalone",
    orientation: "any",
    background_color: "#faf7f2",
    theme_color: "#15130f",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
