import path from "node:path";
import type { NextConfig } from "next";

// Always sourced from API_URL — never a hardcoded host, in any
// environment. Next.js evaluates this config module (and therefore this
// value) once, at `next build` time, not per-request — so API_URL must
// be present as a build-time environment variable wherever this app is
// built (a Vercel project env var, or apps/web/Dockerfile's ARG-based
// build step), not just set at container/runtime startup. See
// apps/web/Dockerfile for how the Docker build assembles it from
// API_URL_SCHEME/API_HOST.
// Strip any trailing slash(es) so a rewrite destination never becomes
// `${apiUrl}//api/:path*`. A double slash is treated by the Express API as a
// distinct, unrouted path (`Cannot POST //api/auth/register` → a non-JSON 404),
// which surfaced in production as register/login failing with a bare
// "Request failed". Tolerating a trailing slash here makes the proxy resilient
// regardless of how API_URL happens to be entered in the deploy environment.
const apiUrl = (process.env.API_URL ?? "http://localhost:4000").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  // Production Hardening Phase 4 — emits .next/standalone, a self-contained
  // server.js + pruned node_modules for the container runtime stage
  // (apps/web/Dockerfile), so the final image doesn't need `next start` or
  // the full dependency tree. Skipped when building on Vercel (which sets
  // its own VERCEL env var): Vercel has its own serverless output pipeline
  // and doesn't run apps/web/Dockerfile at all, and "standalone" output is
  // unnecessary there — it doesn't need to be conditional for correctness
  // anywhere else, but leaving it on has caused build/tracing issues on
  // Vercel in the past for other Next.js monorepos.
  //
  // outputFileTracingRoot must still point at the pnpm workspace root in
  // both cases: this is a monorepo, so apps/web's own dependencies are
  // hoisted/symlinked into the root node_modules, not copied into
  // apps/web/node_modules — Vercel's own tracing needs this too.
  output: process.env.VERCEL ? undefined : "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${apiUrl}/api/:path*` },
      // The dashboard's preview iframe (§18) loads the API's renderer output
      // through this same-origin proxy — the rendered HTML's relative
      // /assets/... image URLs need the same treatment to resolve correctly
      // inside the iframe rather than against the dashboard's own origin.
      { source: "/preview/:path*", destination: `${apiUrl}/preview/:path*` },
      { source: "/assets/:path*", destination: `${apiUrl}/assets/:path*` },
      // §M pre-wildcard-DNS fallback storefront — proxies straight to the
      // API's storeRouter (public-render.routes.ts), which returns a
      // complete HTML document rendered by the exact same renderer as a
      // real *.ordervora.com visit would use. No Next.js page/route exists
      // for this path deliberately — it's a pure proxy, same pattern as
      // /preview and /assets above, so there is only ever one storefront
      // renderer, never a competing one.
      { source: "/store/:path*", destination: `${apiUrl}/store/:path*` },
    ];
  },
};

export default nextConfig;
