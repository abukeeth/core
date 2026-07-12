import { cookies } from "next/headers";

// Always sourced from API_URL — never a hardcoded host, in any
// environment. Unlike next.config.ts's rewrites (baked at build time),
// this module is evaluated at server process startup, so API_URL here
// is read from the runtime environment.
const apiUrl = process.env.API_URL ?? "http://localhost:4000";

export type ServerFetchResult<T> = { ok: true; data: T } | { ok: false; status: number };

export async function serverFetch<T>(path: string, init: RequestInit = {}): Promise<ServerFetchResult<T>> {
  const cookieStore = await cookies();

  try {
    const res = await fetch(`${apiUrl}${path}`, {
      ...init,
      headers: { cookie: cookieStore.toString(), ...init.headers },
      cache: "no-store",
    });

    if (!res.ok) {
      return { ok: false, status: res.status };
    }

    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch {
    return { ok: false, status: 503 };
  }
}
