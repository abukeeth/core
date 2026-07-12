import { createLogger } from "../../../lib/logger";
import type { SectionBlock } from "../types";
import { getSectionRenderer } from "./registry";
import type { RenderContext } from "./render-context";

const logger = createLogger("layout-engine");

/**
 * §15 Layout Engine core: renders an ordered list of section blocks.
 * Unknown/deprecated block types (or ones a component chooses to render
 * as empty, e.g. no gallery images) are skipped with a logged warning
 * rather than crashing the page — deterministic and safe for any
 * definition, including ones from an older schema version.
 */
export function renderSections(sections: SectionBlock[], ctx: RenderContext): string {
  return sections
    .map((section) => {
      const renderer = getSectionRenderer(section.type);
      if (!renderer) {
        logger.warn({ sectionType: section.type }, `No renderer registered for section type "${section.type}" — skipped`);
        return "";
      }
      return renderer(section, ctx);
    })
    .filter((html) => html.trim().length > 0)
    .join("\n");
}
