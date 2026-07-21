import { escapeHtml } from "../html-escape";
import type { RenderContext } from "../render-context";
import type { SectionBlock } from "../../types";

/**
 * Sprint 5 — Age verification gate (21+).
 *
 * A blocking, accessible overlay shown before a restricted-goods storefront
 * (vape / tobacco). Compliance, not styling: it renders visible by default
 * (server-rendered, fail-closed) and a small, self-contained inline script lets
 * a visitor confirm they are 21+ (remembered via localStorage) or shows a polite
 * block state. No external assets, no hotlinks; themed via the same CSS custom
 * properties every other component uses, so it adapts to each theme (dark on
 * vape-vapor). As a fixed, top-layer overlay its position in the section order
 * does not matter — it covers the whole page.
 */
export function renderAgeGate(_section: SectionBlock, ctx: RenderContext): string {
  const name = escapeHtml(ctx.definition.restaurantName);
  return `<div id="ov-age-gate" role="dialog" aria-modal="true" aria-labelledby="ov-age-title" style="position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:1.5rem;background:rgba(6,4,12,0.92);">
  <div style="max-width:26rem;width:100%;text-align:center;background:var(--color-surface-50);color:var(--color-text-700);border:1px solid var(--color-surface-200);border-radius:var(--radius);padding:2.25rem 1.75rem;box-shadow:var(--shadow);">
    <p style="margin:0 0 0.75rem;font-size:0.7rem;letter-spacing:0.28em;text-transform:uppercase;color:var(--color-accent-600);">${name}</p>
    <h2 id="ov-age-title" style="margin:0 0 0.75rem;font-family:var(--font-display);font-size:var(--step-1);color:var(--color-text-700);">Are you 21 or older?</h2>
    <p style="margin:0 0 1.5rem;color:var(--color-text-600);font-size:var(--step--1);line-height:1.6;">You must be at least 21 years of age to enter this store.</p>
    <div style="display:flex;flex-direction:column;gap:0.6rem;">
      <button type="button" id="ov-age-yes" style="min-height:48px;border:0;border-radius:var(--radius);background:var(--color-primary-600);color:#fff;font-weight:700;font-size:var(--step-0);cursor:pointer;">I am 21 or older</button>
      <button type="button" id="ov-age-no" style="min-height:44px;border:1px solid var(--color-surface-300);border-radius:var(--radius);background:transparent;color:var(--color-text-600);font-size:var(--step--1);cursor:pointer;">I am under 21</button>
    </div>
  </div>
</div>
<script>
(function(){
  var g=document.getElementById('ov-age-gate');
  if(!g)return;
  try{if(localStorage.getItem('ov_age_ok')==='1'){if(g.parentNode)g.parentNode.removeChild(g);return;}}catch(e){}
  var html=document.documentElement;html.style.overflow='hidden';
  var yes=document.getElementById('ov-age-yes'),no=document.getElementById('ov-age-no');
  if(yes)yes.addEventListener('click',function(){try{localStorage.setItem('ov_age_ok','1');}catch(e){}html.style.overflow='';if(g.parentNode)g.parentNode.removeChild(g);});
  if(no)no.addEventListener('click',function(){g.innerHTML='<div style="max-width:26rem;text-align:center;color:#fff;padding:2rem;">Sorry — you must be 21 or older to visit this store.</div>';});
})();
</script>`;
}
