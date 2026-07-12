import { escapeHtml } from "../html-escape";
import type { RenderContext } from "../render-context";
import type { SectionBlock } from "../../types";

interface ReviewEntry {
  author: string;
  quote: string;
  rating?: number;
  photoUrl?: string;
}

function renderStars(rating: number): string {
  const full = Math.max(0, Math.min(5, Math.round(rating)));
  return "★".repeat(full) + "☆".repeat(5 - full);
}

/**
 * Sprint 20A Task 5 — "Reviews": this data model has no customer-review
 * source to pull real reviews from (the same documented gap "testimonials"
 * already had — see section-rules.ts). The owner's own typed-in quotes are
 * the real, non-fabricated content here; nothing is auto-generated.
 */
export function renderReviews(section: SectionBlock, _ctx: RenderContext): string {
  const title = typeof section.props.title === "string" ? section.props.title : "What Customers Say";
  const layout = typeof section.props.layout === "string" ? section.props.layout : "grid";
  const showRating = typeof section.props.showRating === "boolean" ? section.props.showRating : true;
  const showPhotos = typeof section.props.showPhotos === "boolean" ? section.props.showPhotos : false;
  const reviews = Array.isArray(section.props.reviews) ? (section.props.reviews as ReviewEntry[]) : [];

  if (reviews.length === 0) return "";

  const cards = reviews
    .map(
      (review) => `<li class="card" style="list-style:none;padding:1.25rem;background:var(--color-surface-100);${layout === "list" ? "display:flex;gap:1rem;align-items:flex-start;" : ""}">
      ${showPhotos && review.photoUrl ? `<img src="${escapeHtml(review.photoUrl)}" alt="${escapeHtml(review.author)}" style="width:48px;height:48px;border-radius:999px;object-fit:cover;flex-shrink:0;" />` : ""}
      <div>
        ${showRating && review.rating ? `<p style="margin:0 0 0.25rem;color:var(--color-accent-600);" aria-label="${review.rating} out of 5 stars">${renderStars(review.rating)}</p>` : ""}
        <p style="margin:0 0 0.5rem;font-style:italic;">&ldquo;${escapeHtml(review.quote)}&rdquo;</p>
        <p style="margin:0;font-weight:600;">${escapeHtml(review.author)}</p>
      </div>
    </li>`,
    )
    .join("\n");

  return `<section class="reviews">
  <h2>${escapeHtml(title)}</h2>
  <ul style="${
    layout === "list"
      ? "display:flex;flex-direction:column;gap:1rem;padding:0;"
      : "display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:1rem;padding:0;"
  }">
    ${cards}
  </ul>
</section>`;
}
