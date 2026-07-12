/**
 * @types/node's ambient `Response`/`Headers` (web-globals/fetch.d.ts) each
 * conditionally resolve to an empty interface when a
 * `typeof globalThis extends { onmessage: any }` check thinks a DOM lib is
 * already in scope. Some build environments (confirmed: Vercel's
 * zero-config Node.js Function builder) trip that check even with
 * `"lib": ["ES2022"]` and no DOM lib included, leaving these globals
 * memberless there while they're fully populated locally — see
 * src/lib/safe-fetch.ts for the investigation. Declaration merging adds
 * the real members back onto the global interfaces directly, independent
 * of whichever branch of that ambient check any given build environment
 * takes.
 */
export {};

declare global {
  interface Headers {
    append(name: string, value: string): void;
    delete(name: string): void;
    get(name: string): string | null;
    has(name: string): boolean;
    set(name: string, value: string): void;
    getSetCookie(): string[];
    forEach(callbackfn: (value: string, key: string, parent: Headers) => void, thisArg?: unknown): void;
  }

  interface Response {
    readonly headers: Headers;
    readonly ok: boolean;
    readonly status: number;
    readonly statusText: string;
    readonly redirected: boolean;
    readonly url: string;
    readonly bodyUsed: boolean;
    json(): Promise<unknown>;
    text(): Promise<string>;
    arrayBuffer(): Promise<ArrayBuffer>;
  }
}
