"use client";

import { stepIndex } from "./build-steps";

interface WebsiteMockupProps {
  activeStepId: string;
  reducedMotion: boolean;
  /** The winning design's real brand color, known from SELECTING onward — replaces the generic placeholder gradient. */
  colorSeed?: string | null;
}

function Block({
  solid,
  reducedMotion,
  className,
  colorSeed,
}: {
  solid: boolean;
  reducedMotion: boolean;
  className: string;
  colorSeed?: string | null;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-md transition-colors duration-700 ${className} ${
        solid ? (colorSeed ? "" : "bg-gradient-to-br from-foreground/80 to-foreground/40") : "bg-zinc-200 dark:bg-zinc-800"
      }`}
      style={solid && colorSeed ? { background: `linear-gradient(135deg, ${colorSeed}, ${colorSeed}cc)` } : undefined}
    >
      {!solid && !reducedMotion && (
        <div className="absolute inset-0 w-1/3 animate-[shimmer-sweep_1.6s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent dark:via-white/15" />
      )}
    </div>
  );
}

/**
 * A schematic "your website is assembling itself" preview — each block
 * solidifies from a skeleton placeholder into a filled block as its real
 * corresponding backend stage completes. Uses the actual winning design's
 * color as soon as it's known (SELECTING onward); generic until then, since
 * no real color exists yet — an honest structural reveal, not fabricated
 * content.
 */
export function WebsiteMockup({ activeStepId, reducedMotion, colorSeed }: WebsiteMockupProps) {
  const idx = stepIndex(activeStepId);
  const isDone = (stageId: string) => idx > stepIndex(stageId) || activeStepId === "done";

  const headerReady = isDone("THEME_SELECTION") || activeStepId === "THEME_SELECTION";
  const heroReady = isDone("CONTENT_GENERATION");
  const menuReady = isDone("ASSEMBLY");
  const galleryReady = isDone("ASSETS");
  const footerReady = isDone("SCORING") || isDone("FINALIZE");
  const isLive = activeStepId === "PUBLISHING" || activeStepId === "PROVISIONING" || activeStepId === "done";

  return (
    <div className="mx-auto w-full max-w-md overflow-hidden rounded-xl border border-black/[.08] bg-white shadow-sm dark:border-white/[.145] dark:bg-zinc-950">
      <div className="flex items-center gap-1.5 border-b border-black/[.08] bg-zinc-50 px-3 py-2 dark:border-white/[.145] dark:bg-zinc-900">
        <span className="h-2.5 w-2.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
        <span className="h-2.5 w-2.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
        <span className="h-2.5 w-2.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
        {isLive && (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> Live
          </span>
        )}
      </div>
      <div className="flex flex-col gap-3 p-4">
        <Block solid={headerReady} reducedMotion={reducedMotion} colorSeed={colorSeed} className="h-6 w-2/3" />
        <Block solid={heroReady} reducedMotion={reducedMotion} colorSeed={colorSeed} className="h-20 w-full" />
        <div className="grid grid-cols-3 gap-2">
          <Block solid={menuReady} reducedMotion={reducedMotion} colorSeed={colorSeed} className="h-12" />
          <Block solid={menuReady} reducedMotion={reducedMotion} colorSeed={colorSeed} className="h-12" />
          <Block solid={menuReady} reducedMotion={reducedMotion} colorSeed={colorSeed} className="h-12" />
        </div>
        <div className="grid grid-cols-4 gap-2">
          <Block solid={galleryReady} reducedMotion={reducedMotion} colorSeed={colorSeed} className="h-10" />
          <Block solid={galleryReady} reducedMotion={reducedMotion} colorSeed={colorSeed} className="h-10" />
          <Block solid={galleryReady} reducedMotion={reducedMotion} colorSeed={colorSeed} className="h-10" />
          <Block solid={galleryReady} reducedMotion={reducedMotion} colorSeed={colorSeed} className="h-10" />
        </div>
        <Block solid={footerReady} reducedMotion={reducedMotion} colorSeed={colorSeed} className="h-8 w-full" />
      </div>
    </div>
  );
}
