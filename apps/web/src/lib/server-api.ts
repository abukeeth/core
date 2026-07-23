import { cookies } from "next/headers";

// Always sourced from API_URL — never a hardcoded host, in any
// environment. Unlike next.config.ts's rewrites (baked at build time),
// this module is evaluated at server process startup, so API_URL here
// is read from the runtime environment.
// Trailing slash(es) stripped for the same reason as next.config.ts's
// rewrites: `${apiUrl}${path}` (path already begins with `/api/...`) must not
// become a double slash, which the Express API treats as an unrouted 404.
const apiUrl = (process.env.API_URL ?? "http://localhost:4000").replace(/\/+$/, "");

// A Server Component awaiting serverFetch blocks that page's entire
// server-side render — a hung call here (e.g. a cold-started backend)
// reads to the browser as a stalled navigation, not just a stuck button.
// Same reasoning as apps/web/src/lib/api.ts's DEFAULT_TIMEOUT_MS: generous
// enough to survive a slow cold start rather than fight it, bounded so it
// never hangs forever.
const DEFAULT_TIMEOUT_MS = 25_000;

export type ServerFetchFailureReason = "timeout" | "network" | "http";

export type ServerFetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; reason: ServerFetchFailureReason };

function isTimeoutError(err: unknown): boolean {
  return err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError");
}

export async function serverFetch<T>(path: string, init: RequestInit = {}): Promise<ServerFetchResult<T>> {
  const cookieStore = await cookies();

  let res: Response;
  try {
    res = await fetch(`${apiUrl}${path}`, {
      ...init,
      headers: { cookie: cookieStore.toString(), ...init.headers },
      cache: "no-store",
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
  } catch (err) {
    return { ok: false, status: 503, reason: isTimeoutError(err) ? "timeout" : "network" };
  }

  if (!res.ok) {
    return { ok: false, status: res.status, reason: "http" };
  }

  const data = (await res.json()) as T;
  return { ok: true, data };
}
