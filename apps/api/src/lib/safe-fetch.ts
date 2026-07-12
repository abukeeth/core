import dns from "node:dns/promises";
import net from "node:net";

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export class SafeFetchError extends Error {}

/**
 * @types/node's ambient `Response` type intentionally resolves to an
 * empty interface when it thinks a DOM-lib `Response` is already in
 * scope (a `typeof globalThis extends { onmessage: any }` check in
 * web-globals/fetch.d.ts). Some build environments (confirmed: Vercel's
 * zero-config Node.js Function builder for files under `api/`) trip
 * that check even with `"lib": ["ES2022"]` and an identical pinned
 * `@types/node` version, leaving the real `Response`/`fetch()` return
 * type memberless there while it's fully populated locally. Declaring
 * our own narrow structural shape for exactly the members this file
 * touches — and asserting into it once, at the `fetch()` call site —
 * makes the rest of the file immune to which branch of that ambient
 * check any given build environment takes.
 */
interface FetchResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly headers: { get(name: string): string | null };
  readonly body: {
    getReader(): {
      read(): Promise<{ done: false; value: Uint8Array } | { done: true; value?: undefined }>;
      cancel(): Promise<void>;
    };
  } | null;
}

function ipv4ToLong(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function isIpv4InCidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToLong(ip) & mask) === (ipv4ToLong(range) & mask);
}

// Private, loopback, link-local (including the 169.254.169.254 cloud
// metadata endpoint), CGNAT, and reserved ranges.
const BLOCKED_IPV4_RANGES = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "224.0.0.0/4",
  "240.0.0.0/4",
];

function isBlockedIpv4(ip: string): boolean {
  return BLOCKED_IPV4_RANGES.some((cidr) => isIpv4InCidr(ip, cidr));
}

function isBlockedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1") return true;
  if (normalized.startsWith("fe80:")) return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("::ffff:")) {
    const embeddedV4 = normalized.split(":").pop();
    if (embeddedV4 && net.isIPv4(embeddedV4)) return isBlockedIpv4(embeddedV4);
  }
  return false;
}

function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isBlockedIpv4(ip);
  if (net.isIPv6(ip)) return isBlockedIpv6(ip);
  return true;
}

/**
 * Resolves the hostname and rejects private/internal targets. Note: this
 * checks the address at lookup time; it does not pin the connection to
 * that exact address, so a DNS-rebinding attack (hostname resolves
 * differently between this check and the actual fetch) is a known
 * residual risk not addressed by this MVP guard.
 */
async function assertUrlIsSafe(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SafeFetchError(`Unsupported URL scheme: ${url.protocol}`);
  }

  const { address } = await dns.lookup(url.hostname);
  if (isBlockedIp(address)) {
    throw new SafeFetchError(`URL resolves to a disallowed address: ${url.hostname}`);
  }
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
}

export interface SafeFetchResult {
  buffer: Buffer;
  contentType: string | null;
  finalUrl: string;
}

export async function safeFetch(inputUrl: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

  let currentUrl = new URL(inputUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    await assertUrlIsSafe(currentUrl);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: FetchResponse;
    try {
      response = (await fetch(currentUrl, {
        redirect: "manual",
        signal: controller.signal,
      })) as unknown as FetchResponse;
    } finally {
      clearTimeout(timeout);
    }

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        throw new SafeFetchError("Redirect response missing a Location header");
      }
      currentUrl = new URL(location, currentUrl);
      continue;
    }

    if (!response.ok) {
      throw new SafeFetchError(`Request to ${currentUrl.href} failed with status ${response.status}`);
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) > maxBytes) {
      throw new SafeFetchError(`Response exceeds the maximum allowed size of ${maxBytes} bytes`);
    }

    const buffer = await readBodyWithCap(response, maxBytes);
    return { buffer, contentType: response.headers.get("content-type"), finalUrl: currentUrl.href };
  }

  throw new SafeFetchError("Too many redirects");
}

async function readBodyWithCap(response: FetchResponse, maxBytes: number): Promise<Buffer> {
  const reader = response.body?.getReader();
  if (!reader) {
    return Buffer.alloc(0);
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new SafeFetchError(`Response exceeds the maximum allowed size of ${maxBytes} bytes`);
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks);
}
