import { z } from "zod";
import { getAIProvider, type AICompletionRequest } from "../../../../lib/ai";
import { creativeBriefSchema, type BusinessUnderstanding, type CreativeBrief } from "../contracts";
import { availableSections, BODY_FONTS, DISPLAY_FONTS, HERO_COMPOSITIONS, PRODUCT_LAYOUTS } from "./capabilities";
import { validateDiversity } from "./diversity-validator";

/**
 * Generation V2 — the Creative Brief generator (P1).
 *
 * Thinks like THREE DIFFERENT CREATIVE AGENCIES receiving the same client:
 * every brief is invented from the BusinessUnderstanding (its evidence,
 * catalog, prices, positioning), constrained only by the renderer's physical
 * capabilities. There is no catalog of directions to pick from; the same
 * business generated twice (different seed) produces different valid trios.
 *
 * Two paths, one contract:
 *  - AI path: one completion writes all three briefs, instructed to disagree.
 *  - Procedural floor (AI off/unavailable/invalid): briefs are COMPOSED from
 *    the business's own evidence — angle builders that only activate when the
 *    evidence supports them — with every visual axis chosen by a seeded draw
 *    from the full capability inventory. Deterministic for a given
 *    (business, seed); a new seed yields a different, equally valid trio.
 */

export interface GenerateBriefsDeps {
  complete?: (request: AICompletionRequest) => Promise<string>;
  /** Varies per generation run (e.g. batchId) so regeneration explores anew. */
  seed?: string;
}

export interface GenerateBriefsResult {
  briefs: CreativeBrief[];
  origin: "ai" | "procedural";
  attempts: number;
}

// ---------------------------------------------------------------------------
// Seeded randomness — deterministic per (business, seed), different across seeds.
// ---------------------------------------------------------------------------

function hash(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function rng(seedText: string): () => number {
  let state = hash(seedText) || 1;
  return () => {
    state = Math.imul(state ^ (state >>> 15), state | 1) >>> 0;
    state ^= state + Math.imul(state ^ (state >>> 7), state | 61);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
}

function pickDistinct<T>(pool: readonly T[], count: number, random: () => number): T[] {
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// ---------------------------------------------------------------------------
// Angle builders — creative directions that EXIST ONLY WHEN THE EVIDENCE DOES.
// Each composes idea/voice/copy from the business's real products and claims.
// ---------------------------------------------------------------------------

interface Angle {
  key: string;
  idea: string;
  target: string;
  personality: string[];
  voice: string;
  headline: string;
  subhead: string;
  cta: string;
  photoSubjects: string[];
  photoTreatment: string;
  emphasis: string;
  trust: string[];
  /** The conversion philosophy — it OWNS the whole page program below. */
  philosophy: string;
  /** Complete home program (hero first, footer appended by the composer):
   * different angles have genuinely different information hierarchies —
   * catalog-first vs story-first vs visit-first — different lengths, and
   * their own CTA cadence. */
  program: string[];
  hero: { scale: "compact" | "standard" | "tall" | "full"; alignment: "left" | "center" | "right" };
}

function anglesFor(u: BusinessUnderstanding, random: () => number): Angle[] {
  const name = u.identity.name;
  const flagship = u.catalog.flagshipProducts[0] ?? "the house special";
  const second = u.catalog.flagshipProducts[1] ?? flagship;
  const topCategory = u.catalog.categories[0]?.name ?? "the menu";
  const has = (source: string, text: RegExp) => u.evidence.some((e) => e.source === source && text.test(e.claim));
  const noun = u.catalog.categories.length > 0 ? topCategory.toLowerCase() : "menu";

  const pool: Angle[] = [];

  if (has("DESCRIPTION", /process-proud|craft/i)) {
    pool.push({
      key: "craft",
      idea: `The making of ${flagship} — process as proof, shown step by step`,
      target: "People who ask how it's made before what it costs",
      personality: ["patient", "exacting", "proud", "honest"],
      voice: "plainspoken pride, technical details worn lightly",
      headline: `${flagship}, made the long way.`,
      subhead: "No shortcuts anywhere in the building.",
      cta: "See how we make it",
      photoSubjects: [`${flagship} mid-preparation`, "hands at work", "raw ingredients"],
      photoTreatment: "reportage process photography, honest and unstaged",
      emphasis: "the method behind each item",
      trust: ["Made in-house daily"],
      philosophy: "editorial: the story earns the sale — method before catalog",
      program: ["customTextImage", "signatureDishes", "menu", "hoursLocation"],
      hero: { scale: "tall", alignment: "left" },
    });
  }

  if (has("PRICES", /occasions|celebration/i)) {
    const top = u.catalog.flagshipProducts.find(() => true) ?? flagship;
    pool.push({
      key: "occasions",
      idea: `Lead with the celebration line — the storefront as an occasions studio`,
      target: "Planners ordering ahead for a date that matters",
      personality: ["polished", "reassuring", "celebratory"],
      voice: "calm concierge — you bring the date, we handle the rest",
      headline: `The centerpiece, handled.`,
      subhead: `Order ${top} ahead — we'll have it ready for the day.`,
      cta: "Order for a date",
      photoSubjects: [`${top} as a finished centerpiece`, "a table set for a celebration"],
      photoTreatment: "studio-lit portraits of the finished piece, clean backdrops",
      emphasis: "the occasion line first, daily items second",
      trust: ["Order-ahead promise", "Serves guidance on every item"],
      philosophy: "concierge: reassure, then book the date — one ask, made early",
      program: ["featuredProducts", "ctaBanner", "aboutTeaser", "contactInfo"],
      hero: { scale: "full", alignment: "center" },
    });
  }

  if (has("MENU", /dessert daypart|evening/i)) {
    pool.push({
      key: "evening",
      idea: `Own the after-hours visit: ${noun} as an evening ritual`,
      target: "After-dinner couples and late study groups",
      personality: ["unhurried", "intimate", "warm"],
      voice: "low-lit and easy — stay a while",
      headline: `The evening starts at ${name.split(" ")[0]}.`,
      subhead: `${second} after dark. Open late.`,
      cta: "See tonight's list",
      photoSubjects: ["shared table at night", `${second} in warm low light`],
      photoTreatment: "candle-warm low-key tabletop photography",
      emphasis: "pairings and shareables over single items",
      trust: ["Open late"],
      philosophy: "ambiance: sell the evening, not the item — mood first, hours prominent",
      program: ["featuredProducts", "customTextImage", "hoursLocation", "ctaBanner"],
      hero: { scale: "tall", alignment: "right" },
    });
  }

  if (has("MENU", /repeat purchases|consumables/i)) {
    pool.push({
      key: "restock",
      idea: "A reorder machine — optimize the 60-second repeat purchase",
      target: "Regulars who know exactly what they need",
      personality: ["efficient", "reliable", "no-nonsense"],
      voice: "terse and useful, specs up front",
      headline: "Your usual, restocked in a minute.",
      subhead: "Everything in stock, nothing out of date.",
      cta: "Reorder now",
      photoSubjects: ["clean product flat-lays", "the stocked shelf"],
      photoTreatment: "hard single-light product photography, true to color",
      emphasis: "stock states, compatibility, speed",
      trust: ["Always in stock", "Fresh inventory"],
      philosophy: "conversion: the catalog IS the homepage — compact hero, buy within one scroll",
      program: ["menu", "features", "ctaBanner", "hoursLocation"],
      hero: { scale: "compact", alignment: "left" },
    });
  }

  // Always-available angles — still parameterized by THIS business's data.
  pool.push(
    {
      key: "flagship",
      idea: `One hero product carries the brand: ${flagship} is the argument`,
      target: `People who came because someone told them about ${flagship}`,
      personality: ["confident", "focused", "generous"],
      voice: "one thing said well, no hedging",
      headline: `${flagship}.`,
      subhead: `The reason people cross town to ${name}.`,
      cta: u.services.pickup ? "Order it now" : "Come try it",
      photoSubjects: [`${flagship} close and centered`, "the moment it's served"],
      photoTreatment: "single-subject hero photography, shallow depth",
      emphasis: `${flagship} first; everything else supports it`,
      trust: [`Known for ${flagship}`],
      philosophy: "spotlight: one product, one argument — everything else is an appendix",
      program: ["signatureDishes", "customTextImage", "ctaBanner", "menu"],
      hero: { scale: "full", alignment: "center" },
    },
    {
      key: "neighborhood",
      idea: `The corner institution: ${name} as part of the street's daily rhythm`,
      target: "Locals within ten minutes' walk",
      personality: ["familiar", "unpretentious", "welcoming"],
      voice: "first-name-basis friendly",
      headline: `Your corner ${u.identity.resolvedVertical.toLowerCase().replace(/_/g, " ").replace("shop", "spot")}.`,
      subhead: "Same faces, same quality, every day.",
      cta: "Stop by today",
      photoSubjects: ["the counter and the people behind it", "regulars' favorites on the board"],
      photoTreatment: "natural-light lifestyle photography, people welcome",
      emphasis: "familiarity — favorites and staff picks",
      trust: ["Independent & local"],
      philosophy: "community: visit-us before sell-to-us — hours and place lead, catalog follows",
      program: ["hoursLocation", "featuredCategories", "customTextImage", "ctaBanner"],
      hero: { scale: "standard", alignment: "center" },
    },
    {
      key: "speed",
      idea: "The reliable fast option done properly — quality at lunch speed",
      target: "Weekday customers with 30 minutes, not 90",
      personality: ["brisk", "precise", "dependable"],
      voice: "short sentences, concrete promises",
      headline: "In. Out. Excellent.",
      subhead: `${flagship} ready in minutes, made this morning.`,
      cta: u.services.pickup ? "Order pickup" : "See the quick menu",
      photoSubjects: ["ready-to-go items lined up", `${flagship} packed to travel`],
      photoTreatment: "bright clean daylight, overhead order-ready shots",
      emphasis: "speed badges and prep times beside items",
      trust: ["Ready in minutes"],
      philosophy: "utility: answer 'what can I get right now' immediately — no storytelling",
      program: ["menu", "features", "hoursLocation"],
      hero: { scale: "compact", alignment: "center" },
    },
    {
      key: "range",
      idea: `The full spread: ${u.catalog.menuBreadth.categoryCount} categories, one standard`,
      target: "Groups where everyone wants something different",
      personality: ["abundant", "organized", "crowd-pleasing"],
      voice: "tour-guide enthusiasm with a map",
      headline: `${u.catalog.menuBreadth.itemCount} ways to get this right.`,
      subhead: `From ${topCategory.toLowerCase()} to ${(u.catalog.categories.at(-1)?.name ?? "more").toLowerCase()}.`,
      cta: "Browse everything",
      photoSubjects: ["a spread across categories", "variety on one table"],
      photoTreatment: "overhead abundance photography, full-table spreads",
      emphasis: "category navigation as the primary journey",
      trust: ["Something for everyone"],
      philosophy: "discovery: the map is the message — categories as the primary navigation",
      program: ["featuredCategories", "menu", "ctaBanner", "aboutTeaser"],
      hero: { scale: "standard", alignment: "center" },
    },
  );

  // Three angles whose OPENING HIERARCHY differs: the section right after the
  // hero must be pairwise different, so the three storefronts diverge from the
  // very first scroll — not just in skin.
  const shuffled = pickDistinct(pool, pool.length, random);
  const chosen: Angle[] = [];
  for (const candidate of shuffled) {
    if (chosen.length === 3) break;
    if (chosen.some((a) => a.program[0] === candidate.program[0])) continue;
    chosen.push(candidate);
  }
  for (const candidate of shuffled) {
    if (chosen.length === 3) break;
    if (!chosen.includes(candidate)) chosen.push(candidate);
  }
  return chosen;
}

// ---------------------------------------------------------------------------
// Procedural composition — visual axes drawn from the full inventory, per seed.
// ---------------------------------------------------------------------------

const GROUND_CLASSES = ["dark", "light", "tinted"] as const;

function proceduralBriefs(u: BusinessUnderstanding, seedText: string): CreativeBrief[] {
  const random = rng(`${u.identity.name}::${seedText}`);
  const angles = anglesFor(u, random);

  // Visual axes: distinct draws from the FULL inventories. The three ground
  // classes are a diversity guarantee (dark/light/tinted must all appear); the
  // actual hues are seeded per business, so no two businesses share a palette.
  const baseHue = Math.floor(random() * 360);
  const hueJitter = () => (random() - 0.5) * 50;
  const displays = pickDistinct(DISPLAY_FONTS, 3, random);
  const bodies = pickDistinct(BODY_FONTS, 3, random);
  const heroes = pickDistinct(HERO_COMPOSITIONS, 3, random);
  const layouts = pickDistinct(PRODUCT_LAYOUTS, 3, random);
  const grounds = pickDistinct(GROUND_CLASSES, 3, random);
  const sections = new Set(availableSections());

  return angles.map((angle, i) => {
    const groundClass = grounds[i];
    const hue = (baseHue + i * 120 + hueJitter() + 360) % 360;
    const ground =
      groundClass === "dark"
        ? hslToHex(hue, 0.28, 0.09)
        : groundClass === "light"
          ? hslToHex(hue, 0.25, 0.975)
          : hslToHex(hue, 0.5, 0.9);
    const ink = groundClass === "dark" ? hslToHex(hue, 0.22, 0.93) : hslToHex(hue, 0.35, 0.12);
    const brand = hslToHex(hue, 0.55, groundClass === "dark" ? 0.55 : 0.34);
    const accent = hslToHex((hue + 40) % 360, 0.65, groundClass === "dark" ? 0.62 : 0.45);

    // The angle's philosophy OWNS the page program (hierarchy, rhythm, CTA
    // cadence, length) — the composer only guarantees hero/footer bookends.
    const home = ["hero", ...angle.program.filter((s) => sections.has(s)), "footer"].filter((s, idx, arr) => arr.indexOf(s) === idx);

    return creativeBriefSchema.parse({
      schemaVersion: 1,
      id: `brief-${i + 1}-${angle.key}`,
      centralIdea: angle.idea,
      targetCustomer: angle.target,
      brandPersonality: angle.personality,
      valueProposition: angle.subhead,
      differentiator: angle.idea,
      copyVoice: { voice: angle.voice, sampleHeadline: angle.headline, sampleCta: angle.cta },
      photography: {
        treatment: angle.photoTreatment,
        lighting:
          groundClass === "dark" ? "low-key directional light, deep shadow" : groundClass === "light" ? "bright soft daylight" : "golden warm ambient light",
        backdrop: groundClass === "dark" ? "dark textured surfaces" : groundClass === "light" ? "clean pale surfaces" : "warm natural materials",
        subjects: angle.photoSubjects,
      },
      typography: { display: displays[i], body: bodies[i] },
      colorLogic: {
        rationale: `${groundClass} ground seeded from the business identity (hue ${Math.round(hue)}°), ${angle.key} angle`,
        ground: { hex: ground, luminanceClass: groundClass },
        ink,
        brand,
        accent,
      },
      heroConcept: {
        composition: heroes[i],
        headline: angle.headline,
        subhead: angle.subhead,
        imageSubject: angle.photoSubjects[0],
        scale: angle.hero.scale,
        alignment: angle.hero.alignment,
      },
      productPresentation: { layout: layouts[i], emphasis: angle.emphasis },
      shape: {
        buttonStyle: (["rounded", "pill", "square"] as const)[Math.floor(random() * 3)],
        borderRadius: [0, 2, 8, 12, 16, 20, 24][Math.floor(random() * 7)],
        shadowIntensity: (["none", "soft", "medium"] as const)[Math.floor(random() * 3)],
      },
      conversionStrategy: { primaryCta: angle.cta, trustSignals: angle.trust },
      structure: { home, philosophy: angle.philosophy },
      origin: "procedural",
    });
  });
}

// ---------------------------------------------------------------------------
// AI path — one completion, three disagreeing agencies, strict JSON.
// ---------------------------------------------------------------------------

const aiResponseSchema = z.object({ briefs: z.array(z.unknown()).length(3) });

function buildPrompt(u: BusinessUnderstanding): string {
  return [
    `You are THREE DIFFERENT independent creative agencies. Each of you received the same client and must pitch a COMPLETE storefront direction. You have never met; you must disagree in concept, tone, palette, typography, layout and photography. Changing colors alone is failure.`,
    ``,
    `CLIENT (all facts are real; use them, especially product names):`,
    JSON.stringify(u, null, 2),
    ``,
    `PHYSICAL CONSTRAINTS (the only allowed enumerations — materials, not styles):`,
    `- typography.display: ${DISPLAY_FONTS.join(", ")}`,
    `- typography.body: ${BODY_FONTS.join(", ")}`,
    `- heroConcept.composition: ${HERO_COMPOSITIONS.join(", ")}`,
    `- productPresentation.layout: ${PRODUCT_LAYOUTS.join(", ")}`,
    `- structure.home section types: ${availableSections().join(", ")} (start with "hero", end with "footer")`,
    ``,
    `Reply with ONLY valid JSON: {"briefs":[brief,brief,brief]} where each brief has exactly these fields:`,
    `schemaVersion:1, id, centralIdea, targetCustomer, brandPersonality[2-6], valueProposition, differentiator,`,
    `copyVoice{voice,sampleHeadline,sampleCta}, photography{treatment,lighting,backdrop,subjects[]},`,
    `typography{display,body}, colorLogic{rationale,ground{hex,luminanceClass:dark|light|tinted},ink,brand,accent},`,
    `heroConcept{composition,headline,subhead,imageSubject,scale:compact|standard|tall|full,alignment:left|center|right},`,
    `productPresentation{layout,emphasis},`,
    `shape{buttonStyle:rounded|pill|square,borderRadius:0-32,shadowIntensity:none|soft|medium|strong},`,
    `conversionStrategy{primaryCta,trustSignals[],secondaryPath?}, structure{home[],philosophy}.`,
    `All hex values as #RRGGBB. Headlines must be specific to this business (name real products).`,
    `VISUAL BALANCE RULE: at most ONE of the three briefs may use a dark ground, and only when the business evidence truly supports it; never use black-and-gold as a shortcut for premium. Favor light, bright, cream, or color-led grounds.`,
    `EXPERIENTIAL DIVERSITY RULE (hard): each agency must commit to a DIFFERENT conversion philosophy (e.g. editorial story-first, conversion catalog-first, community visit-first, product spotlight, discovery) and structure.home must express it: the section immediately after "hero" must be different in all three briefs, section counts should differ, CTA cadence is yours (a brief may omit ctaBanner entirely or place it twice), and hero scale/alignment should match the philosophy (a conversion-first page opens compact; an editorial one may open full). "customTextImage" is a story chapter you may use. Do NOT converge on hero → products → why-us.`,
  ].join("\n");
}

function parseAiBriefs(raw: string): CreativeBrief[] | undefined {
  try {
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    if (jsonStart < 0 || jsonEnd <= jsonStart) return undefined;
    const parsed = aiResponseSchema.parse(JSON.parse(raw.slice(jsonStart, jsonEnd + 1)));
    const briefs = parsed.briefs.map((b, i) => creativeBriefSchema.parse({ ...(b as Record<string, unknown>), origin: "ai", id: `brief-${i + 1}` }));
    return briefs;
  } catch {
    return undefined;
  }
}

/**
 * Generate three diverse creative briefs for a business. AI first (with one
 * diversity-repair retry), then the procedural floor — which passes the
 * diversity gate by construction but is validated all the same.
 */
export async function generateCreativeBriefs(u: BusinessUnderstanding, deps: GenerateBriefsDeps = {}): Promise<GenerateBriefsResult> {
  const seed = deps.seed ?? "0";
  let attempts = 0;

  const complete = deps.complete ?? ((request: AICompletionRequest) => getAIProvider().complete(request));
  try {
    attempts += 1;
    let briefs = parseAiBriefs(await complete({ text: buildPrompt(u), maxTokens: 4000 }));
    if (briefs) {
      // Light-first balance (bias prevention, not an archetype): more than one
      // dark ground in a trio is treated as a failure to repair.
      const darkCount = (list: CreativeBrief[]) => list.filter((b) => b.colorLogic.ground.luminanceClass === "dark").length;
      let report = validateDiversity(briefs);
      const problems = () => [
        ...report.pairs.filter((p) => !p.pass).map((p) => `${p.pair.join(" vs ")}: ${[...p.hardFailures, ...p.scoredFailed].join("; ")}`),
        ...(darkCount(briefs!) > 1 ? [`${darkCount(briefs!)} of 3 grounds are dark — at most one may be, and only with supporting evidence`] : []),
      ];
      if (problems().length > 0) {
        attempts += 1;
        const repairPrompt = `${buildPrompt(u)}\n\nYOUR PREVIOUS ATTEMPT FAILED: ${problems().join(" | ")}. Rewrite ALL THREE briefs to fix every failure.`;
        const repaired = parseAiBriefs(await complete({ text: repairPrompt, maxTokens: 4000 }));
        if (repaired) {
          briefs = repaired;
          report = validateDiversity(briefs);
        }
      }
      if (report.pass && darkCount(briefs) <= 1) return { briefs, origin: "ai", attempts };
    }
  } catch {
    // fall through to the procedural floor
  }

  attempts += 1;
  const procedural = proceduralBriefs(u, seed);
  return { briefs: procedural, origin: "procedural", attempts };
}

/** Exported for tests and the shadow harness. */
export { proceduralBriefs, buildPrompt };
