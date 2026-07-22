import { relativeLuminance } from "../../../../lib/color";
import type { CreativeBrief } from "../contracts";

/**
 * Generation V2 — diversity validation (P1, plan §6).
 *
 * "Three different agencies" is measured, not hoped for. Every PAIR of briefs
 * is scored on 8 axes; three are HARD requirements (hero composition, display
 * typeface, ground) and five are scored (a pair must win ≥3). Changing colors
 * alone cannot pass: it fails the hero and typography hard axes outright.
 */

export interface PairReport {
  pair: [string, string];
  hardFailures: string[];
  scoredPassed: string[];
  scoredFailed: string[];
  pass: boolean;
}

export interface DiversityReport {
  pass: boolean;
  pairs: PairReport[];
  /** The brief that appears in the most failing pairs — regenerate this one. */
  weakestBriefId?: string;
}

function hueOf(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

function groundsDiffer(a: CreativeBrief, b: CreativeBrief): boolean {
  const ga = a.colorLogic.ground;
  const gb = b.colorLogic.ground;
  if (ga.luminanceClass !== gb.luminanceClass) return true;
  if (Math.abs(relativeLuminance(ga.hex) - relativeLuminance(gb.hex)) >= 0.25) return true;
  const dh = Math.abs(hueOf(ga.hex) - hueOf(gb.hex));
  return Math.min(dh, 360 - dh) >= 60;
}

/** Normalized Levenshtein distance between two section orders. */
function sectionOrderDistance(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[m][n] / Math.max(m, n);
}

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length > 2),
  );
}

function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / Math.min(a.size, b.size);
}

function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a.map((x) => x.toLowerCase()));
  const sb = new Set(b.map((x) => x.toLowerCase()));
  let shared = 0;
  for (const w of sa) if (sb.has(w)) shared++;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 0 : shared / union;
}

function scorePair(a: CreativeBrief, b: CreativeBrief): PairReport {
  const hardFailures: string[] = [];
  if (a.heroConcept.composition === b.heroConcept.composition) hardFailures.push("hero composition identical");
  if (a.typography.display === b.typography.display) hardFailures.push("display typeface identical");
  if (!groundsDiffer(a, b)) hardFailures.push("grounds too similar (luminance + hue)");

  const scored: [string, boolean][] = [
    ["section order", sectionOrderDistance(a.structure.home, b.structure.home) >= 0.4],
    [
      "photography",
      overlapRatio(words(`${a.photography.lighting} ${a.photography.backdrop}`), words(`${b.photography.lighting} ${b.photography.backdrop}`)) < 0.5,
    ],
    ["copy voice", jaccard(a.brandPersonality, b.brandPersonality) < 0.4],
    ["product presentation", a.productPresentation.layout !== b.productPresentation.layout],
    ["conversion strategy", a.conversionStrategy.primaryCta.toLowerCase() !== b.conversionStrategy.primaryCta.toLowerCase()],
  ];
  const scoredPassed = scored.filter(([, ok]) => ok).map(([name]) => name);
  const scoredFailed = scored.filter(([, ok]) => !ok).map(([name]) => name);

  return { pair: [a.id, b.id], hardFailures, scoredPassed, scoredFailed, pass: hardFailures.length === 0 && scoredPassed.length >= 3 };
}

export function validateDiversity(briefs: CreativeBrief[]): DiversityReport {
  const pairs: PairReport[] = [];
  for (let i = 0; i < briefs.length; i++) {
    for (let j = i + 1; j < briefs.length; j++) {
      pairs.push(scorePair(briefs[i], briefs[j]));
    }
  }
  const failing = pairs.filter((p) => !p.pass);
  let weakestBriefId: string | undefined;
  if (failing.length > 0) {
    const counts = new Map<string, number>();
    for (const p of failing) for (const id of p.pair) counts.set(id, (counts.get(id) ?? 0) + 1);
    weakestBriefId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  }
  return { pass: failing.length === 0, pairs, weakestBriefId };
}
