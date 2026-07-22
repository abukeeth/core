import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Generation V2 — the architectural wall (P0, acceptance test §10.1).
 *
 * V2 must be fully independent of the legacy theme system. This test walks the
 * TRANSITIVE relative-import graph of every module under `v2/` and fails the
 * build if any path reaches a banned legacy file. Renaming or wrapping a
 * banned concept does not evade this: the ban is on the files themselves.
 */

const V2_DIR = __dirname;
const SITES_DIR = path.resolve(__dirname, "..");

/** Legacy design-strategy files V2 must never call (directly or transitively). */
const BANNED = [
  "theme-catalog",
  "theme-matching",
  "identity/identity-packs",
  "assemble",
  "generator", // the V1 orchestrator
  "content-generator", // styleFamily tone adaptation
  "scoring/score-aggregator",
].map((p) => path.resolve(SITES_DIR, p));

function isBanned(resolved: string): string | undefined {
  return BANNED.find((b) => resolved === b || resolved.startsWith(`${b}.`) || resolved.startsWith(`${b}${path.sep}`));
}

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return listSourceFiles(full);
    return full.endsWith(".ts") && !full.endsWith(".test.ts") ? [full] : [];
  });
}

function relativeImportsOf(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const specifiers = [...source.matchAll(/from\s+"(\.{1,2}\/[^"]+)"/g)].map((m) => m[1]);
  return specifiers.map((spec) => path.resolve(path.dirname(file), spec));
}

function resolveToFile(spec: string): string | undefined {
  for (const candidate of [`${spec}.ts`, path.join(spec, "index.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

describe("V2 module boundary — no path into the legacy theme system", () => {
  it("no v2 module reaches theme-catalog / theme-matching / identity-packs / assemble / V1 generator (transitively)", () => {
    const violations: string[] = [];
    const visited = new Set<string>();
    const queue = listSourceFiles(V2_DIR).map((f) => ({ file: f, via: [path.relative(SITES_DIR, f)] }));

    while (queue.length > 0) {
      const { file, via } = queue.pop()!;
      if (visited.has(file)) continue;
      visited.add(file);

      for (const spec of relativeImportsOf(file)) {
        const banned = isBanned(spec);
        if (banned) {
          violations.push(`${via.join(" → ")} → ${path.relative(SITES_DIR, spec)}`);
          continue;
        }
        const resolved = resolveToFile(spec);
        if (resolved && resolved.startsWith(path.resolve(SITES_DIR, ".."))) {
          queue.push({ file: resolved, via: [...via, path.relative(SITES_DIR, resolved)] });
        }
      }
    }

    expect(violations, `V2 imports legacy theme logic:\n${violations.join("\n")}`).toEqual([]);
  });

  it("the ban list itself points at real files (so a rename can't silently disarm the wall)", () => {
    for (const banned of BANNED) {
      expect(existsSync(`${banned}.ts`), `${banned}.ts should exist — update BANNED if the file moved`).toBe(true);
    }
  });
});
