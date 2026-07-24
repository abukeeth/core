import { escapeHtml } from "../html-escape";
import type { RenderContext } from "../render-context";
import type { SectionBlock } from "../../types";

/**
 * Deli flagship — "Build Your Own" band. A brand moment, not a data section: a
 * deep-green panel with bronze step numerals walking through the real ordering
 * flow (pick a base → choose fills → make it yours → order). The copy is
 * generic and truthful (it describes how ordering works, invents no menu facts),
 * the same class of non-fabricated marketing copy the existing "features" band
 * already ships. Renders for the deli theme only.
 */
export function renderBuildYourOwn(_section: SectionBlock, ctx: RenderContext): string {
  const orderUrl = `${ctx.orderingBaseUrl}/order/${ctx.restaurantId}`;
  const steps: { n: string; title: string; body: string }[] = [
    { n: "01", title: "Pick your base", body: "Fresh-baked bread, a wrap, or a bowl — start however you like it." },
    { n: "02", title: "Stack it up", body: "Add your proteins, cheeses, and toppings from the counter." },
    { n: "03", title: "Make it yours", body: "Sauces, sides, and the little extras that make it yours." },
  ];
  const stepCards = steps
    .map(
      (s) => `<li style="list-style:none;flex:1 1 220px;min-width:0;">
        <div style="font-family:var(--font-display);font-size:2.4rem;line-height:1;color:var(--color-accent-400,var(--color-accent-500));">${s.n}</div>
        <h3 style="margin:0.6rem 0 0.3rem;font-family:var(--font-display);font-size:1.25rem;color:#fff;">${escapeHtml(s.title)}</h3>
        <p style="margin:0;color:rgba(255,255,255,0.72);font-size:var(--step--1);line-height:1.55;">${escapeHtml(s.body)}</p>
      </li>`,
    )
    .join("\n");

  return `<section aria-labelledby="byo-title">
  <div style="background:var(--color-primary-700,var(--color-primary-600));border-radius:calc(var(--radius) + 12px);padding:clamp(1.75rem,4vw,3.25rem);color:#fff;box-shadow:var(--shadow);">
    <p style="margin:0 0 0.75rem;font-size:0.72rem;letter-spacing:0.26em;text-transform:uppercase;color:var(--color-accent-400,var(--color-accent-500));">Made your way</p>
    <h2 id="byo-title" style="margin:0 0 1.75rem;font-size:var(--step-2);max-width:16ch;color:#fff;">Build your own, exactly how you like it</h2>
    <ul style="display:flex;flex-wrap:wrap;gap:1.75rem;padding:0;margin:0 0 2rem;">
      ${stepCards}
    </ul>
    <a href="${escapeHtml(orderUrl)}" style="display:inline-block;background:var(--color-accent-500);color:#211E17;text-decoration:none;border-radius:999px;padding:0.8rem 1.8rem;font-weight:700;">Start your order</a>
  </div>
</section>`;
}
