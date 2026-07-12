/**
 * Strips unverifiable superlative/awards claims from LLM-generated copy
 * (§2 Guardrails: "profanity/claims filter — no 'best in the world' health
 * claims"). Applied to every LLM text field before it's schema-validated
 * and stored, never to structured facts (those never go through an LLM).
 */
const BANNED_CLAIM_PATTERNS = [
  /\bbest(?:\s+\w+){0,3}\s+(?:in|on) the (?:world|planet|city|country|state)\b/gi,
  /\bworld[- ]?famous\b/gi,
  /\b#1\b/g,
  /\bnumber one\b/gi,
  /\bhealthiest (?:food|meal|menu|option)\b/gi,
  /\bguarantee(?:d|s)? to cure\b/gi,
  /\baward[- ]?winning\b/gi,
  /\bvoted best\b/gi,
  /\bmichelin[- ]?star(?:red)?\b/gi,
];

export function sanitizeClaims(text: string): string {
  let result = text;
  for (const pattern of BANNED_CLAIM_PATTERNS) {
    result = result.replace(pattern, "");
  }
  return result.replace(/\s{2,}/g, " ").trim();
}

export function containsBannedClaim(text: string): boolean {
  return BANNED_CLAIM_PATTERNS.some((pattern) => new RegExp(pattern).test(text));
}
