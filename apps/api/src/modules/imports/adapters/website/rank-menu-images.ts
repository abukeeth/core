export interface CandidateImage {
  src: string;
  alt?: string;
  nearbyHeading?: string;
  width?: number;
  height?: number;
}

export interface RankedImage extends CandidateImage {
  score: number;
}

const MENU_KEYWORDS = ["menu", "food", "dish", "appetizer", "entree", "entrée", "dessert", "special", "cuisine"];
const NON_MENU_KEYWORDS = ["logo", "icon", "favicon", "avatar", "banner", "hero", "background", "sprite", "thumbnail"];
const TINY_DIMENSION_PX = 100;
const LIKELY_PHOTO_DIMENSION_PX = 300;

function textScore(text: string | undefined): number {
  if (!text) return 0;
  const lower = text.toLowerCase();
  let score = 0;
  for (const keyword of MENU_KEYWORDS) {
    if (lower.includes(keyword)) score += 2;
  }
  for (const keyword of NON_MENU_KEYWORDS) {
    if (lower.includes(keyword)) score -= 3;
  }
  return score;
}

function sizeScore(width?: number, height?: number): number {
  const dims = [width, height].filter((d): d is number => d !== undefined);
  if (dims.length === 0) return 0;

  const maxDim = Math.max(...dims);
  if (maxDim < TINY_DIMENSION_PX) return -5;
  if (maxDim < LIKELY_PHOTO_DIMENSION_PX) return -1;
  return 1;
}

/**
 * Scores and sorts (does not filter) candidate on-page images by how
 * likely they are to show a menu, using page context: alt text, the
 * nearest preceding heading, the filename, and declared dimensions.
 * Ranking, not filtering, is intentional — even when nothing scores
 * well, callers still get a full ordered list to cap and process, so a
 * page with no obviously-labeled menu image doesn't yield zero
 * candidates.
 */
export function rankMenuImages(candidates: CandidateImage[]): RankedImage[] {
  return candidates
    .map((candidate) => ({
      ...candidate,
      score:
        textScore(candidate.alt) +
        textScore(candidate.nearbyHeading) +
        textScore(candidate.src) +
        sizeScore(candidate.width, candidate.height),
    }))
    .sort((a, b) => b.score - a.score);
}
