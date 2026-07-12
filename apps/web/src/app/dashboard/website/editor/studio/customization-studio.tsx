"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ExternalLink, Loader2, Redo2, Undo2 } from "lucide-react";
import { FilterPills } from "@/components/ui";
import { patchDraft, type SiteAsset, type SiteStatus, type WebsiteSiteDefinition } from "@/lib/api";
import { PublishFlowButton } from "../../studio/publish-flow";
import { defaultPropsForType } from "./section-manager";
import { LivePreview } from "./live-preview";
import { BrandSettingsPanel } from "./panels/brand-settings-panel";
import { FooterSettingsPanel } from "./panels/footer-settings-panel";
import { HeaderSettingsPanel } from "./panels/header-settings-panel";
import { MediaPanel } from "./panels/media-panel";
import { ProductPresentationPanel } from "./panels/product-presentation-panel";
import { SectionSettingsPanel } from "./panels/section-settings-panel";
import { SectionManager } from "./section-manager";

type Tab = "sections" | "brand" | "header" | "footer" | "menu" | "media";
type SaveState = "idle" | "saving" | "saved" | "error";

const TABS: Tab[] = ["sections", "brand", "header", "footer", "menu", "media"];
const TAB_LABELS: Record<Tab, string> = {
  sections: "Sections",
  brand: "Brand",
  header: "Header",
  footer: "Footer",
  menu: "Menu",
  media: "Media",
};

const AUTOSAVE_DEBOUNCE_MS = 1200;
const HISTORY_LIMIT = 50;

interface HistoryState {
  stack: WebsiteSiteDefinition[];
  index: number;
}

interface CustomizationStudioProps {
  siteId: string;
  siteStatus: SiteStatus;
  liveUrl: string;
  lastPublishedAt: string | null;
  initialDefinition: WebsiteSiteDefinition;
  initialAssets: SiteAsset[];
}

export function CustomizationStudio({ siteId, siteStatus, liveUrl, lastPublishedAt, initialDefinition, initialAssets }: CustomizationStudioProps) {
  const [historyState, setHistoryState] = useState<HistoryState>({ stack: [initialDefinition], index: 0 });
  const [assets, setAssets] = useState<SiteAsset[]>(initialAssets);
  const [tab, setTab] = useState<Tab>("sections");
  const [activePageSlug, setActivePageSlug] = useState(initialDefinition.pages[0]?.slug ?? "/");
  const [selectedSectionIndex, setSelectedSectionIndex] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [previewOpenOnMobile, setPreviewOpenOnMobile] = useState(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const definition = historyState.stack[historyState.index];
  const activePage = definition.pages.find((p) => p.slug === activePageSlug) ?? definition.pages[0];
  const canUndo = historyState.index > 0;
  const canRedo = historyState.index < historyState.stack.length - 1;

  function commit(next: WebsiteSiteDefinition) {
    setDirty(true);
    setHistoryState((prev) => {
      const truncated = prev.stack.slice(0, prev.index + 1);
      const stack = [...truncated, next].slice(-HISTORY_LIMIT);
      return { stack, index: stack.length - 1 };
    });
  }

  function undo() {
    setHistoryState((prev) => (prev.index > 0 ? { ...prev, index: prev.index - 1 } : prev));
    setDirty(true);
  }

  function redo() {
    setHistoryState((prev) => (prev.index < prev.stack.length - 1 ? { ...prev, index: prev.index + 1 } : prev));
    setDirty(true);
  }

  async function doSave(toSave: WebsiteSiteDefinition) {
    setSaveState("saving");
    try {
      await patchDraft(siteId, toSave);
      setSaveState("saved");
      setDirty(false);
      if (savedBannerTimerRef.current) clearTimeout(savedBannerTimerRef.current);
      savedBannerTimerRef.current = setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 2500);
    } catch {
      setSaveState("error");
    }
  }

  // Autosave with debounce (Task 5 §10) — every commit restarts the timer; only the final settled definition after a pause gets persisted.
  useEffect(() => {
    if (!dirty) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void doSave(definition);
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [definition]);

  // Navigation protection (Task 5 §10) — only while there's a real unsaved change.
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  function handleManualSave() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    void doSave(definition);
  }

  function updatePage(mutator: (page: WebsiteSiteDefinition["pages"][number]) => WebsiteSiteDefinition["pages"][number]) {
    commit({
      ...definition,
      pages: definition.pages.map((p) => (p.slug === activePage?.slug ? mutator(p) : p)),
    });
  }

  const selectedSection = selectedSectionIndex !== null ? activePage?.sections[selectedSectionIndex] : undefined;

  return (
    <div className="flex flex-col gap-4 pb-24 lg:flex-row lg:items-start lg:gap-6 lg:pb-6">
      {/* Controls column */}
      <div className="flex min-w-0 flex-1 flex-col gap-4 lg:max-w-md">
        <SaveBar
          saveState={saveState}
          dirty={dirty}
          onSave={handleManualSave}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={undo}
          onRedo={redo}
          siteId={siteId}
          siteStatus={siteStatus}
          liveUrl={liveUrl}
          lastPublishedAt={lastPublishedAt}
        />

        {definition.pages.length > 1 && (
          <FilterPills
            options={definition.pages.map((p) => p.slug)}
            value={activePageSlug}
            onChange={setActivePageSlug}
            labels={Object.fromEntries(definition.pages.map((p) => [p.slug, p.slug === "/" ? "Home" : p.slug.replace("/", "")]))}
          />
        )}

        <FilterPills options={TABS} value={tab} onChange={setTab} labels={TAB_LABELS} />

        <div className="rounded-2xl border border-[#E7DDCF] bg-white p-4 sm:p-5">
          {tab === "sections" && activePage && (
            <div className="flex flex-col gap-4">
              <SectionManager
                sections={activePage.sections}
                selectedIndex={selectedSectionIndex}
                onSelect={(i) => setSelectedSectionIndex(i)}
                onChange={(next) => updatePage((p) => ({ ...p, sections: next }))}
              />
              {selectedSection && (
                <div className="border-t border-[#E7DDCF] pt-4">
                  <SectionSettingsPanel
                    section={selectedSection}
                    onChange={(next) =>
                      updatePage((p) => ({
                        ...p,
                        sections: p.sections.map((s, i) => (i === selectedSectionIndex ? next : s)),
                      }))
                    }
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirm("Reset this section to its defaults? This can be undone with Undo.")) return;
                      updatePage((p) => ({
                        ...p,
                        sections: p.sections.map((s, i) => (i === selectedSectionIndex ? { ...s, props: defaultPropsForType(s.type) } : s)),
                      }));
                    }}
                    className="mt-3 text-xs font-bold text-[#9A6A2F] underline"
                  >
                    Reset section to defaults
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === "brand" && (
            <div className="flex flex-col gap-4">
              <BrandSettingsPanel value={definition.brandSettings} onChange={(next) => commit({ ...definition, brandSettings: next })} />
              <button
                type="button"
                onClick={() => {
                  if (!confirm("Restore all brand settings to your selected AI Brand Concept's defaults?")) return;
                  commit({ ...definition, brandSettings: undefined });
                }}
                className="self-start text-xs font-bold text-[#9A6A2F] underline"
              >
                Restore AI Brand Concept defaults
              </button>
            </div>
          )}

          {tab === "header" && <HeaderSettingsPanel value={definition.header} onChange={(next) => commit({ ...definition, header: next })} />}

          {tab === "footer" && <FooterSettingsPanel value={definition.footer} onChange={(next) => commit({ ...definition, footer: next })} />}

          {tab === "menu" && (
            <ProductPresentationPanel value={definition.productPresentation} onChange={(next) => commit({ ...definition, productPresentation: next })} />
          )}

          {tab === "media" && <MediaPanel siteId={siteId} assets={assets} onAssetsChange={setAssets} />}
        </div>
      </div>

      {/* Preview column — desktop: sticky sidebar; mobile: toggle sheet */}
      <div className="hidden lg:sticky lg:top-4 lg:block lg:flex-1">
        <LivePreview siteId={siteId} definition={definition} activePath={activePageSlug} />
      </div>

      <button
        type="button"
        onClick={() => setPreviewOpenOnMobile(true)}
        className="fixed bottom-20 left-1/2 z-30 -translate-x-1/2 rounded-full bg-[#171512] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-black/20 lg:hidden"
      >
        Preview
      </button>

      {previewOpenOnMobile && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-white p-3 lg:hidden" role="dialog" aria-modal="true" aria-label="Live preview">
          <div className="flex items-center justify-between pb-2">
            <p className="text-sm font-bold text-[#171512]">Live Preview</p>
            <button type="button" onClick={() => setPreviewOpenOnMobile(false)} className="rounded-full border border-[#E7DDCF] px-3 py-1.5 text-xs font-bold text-[#171512]">
              Close
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <LivePreview siteId={siteId} definition={definition} activePath={activePageSlug} />
          </div>
        </div>
      )}
    </div>
  );
}

function SaveBar({
  saveState,
  dirty,
  onSave,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  siteId,
  siteStatus,
  liveUrl,
  lastPublishedAt,
}: {
  saveState: SaveState;
  dirty: boolean;
  onSave: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  siteId: string;
  siteStatus: SiteStatus;
  liveUrl: string;
  lastPublishedAt: string | null;
}) {
  return (
    <div className="rounded-2xl border border-[#E7DDCF] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={onUndo} disabled={!canUndo} aria-label="Undo" className="flex h-9 w-9 items-center justify-center rounded-full text-[#756B5D] hover:bg-[#F7F0E5] disabled:opacity-30">
            <Undo2 className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" onClick={onRedo} disabled={!canRedo} aria-label="Redo" className="flex h-9 w-9 items-center justify-center rounded-full text-[#756B5D] hover:bg-[#F7F0E5] disabled:opacity-30">
            <Redo2 className="h-4 w-4" aria-hidden="true" />
          </button>
          <SaveIndicator saveState={saveState} dirty={dirty} />
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={saveState === "saving" || (!dirty && saveState !== "error")}
          className="flex min-h-9 items-center gap-1.5 rounded-full bg-[#171512] px-4 text-xs font-bold text-white disabled:opacity-50"
        >
          {saveState === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : "Save"}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#E7DDCF] pt-3">
        <div className="text-xs text-[#8A7D6C]">
          {lastPublishedAt ? (
            <span>Last published {new Date(lastPublishedAt).toLocaleString()}</span>
          ) : (
            <span>Not published yet</span>
          )}
          {siteStatus === "PUBLISHED" && (
            <>
              {" · "}
              <a href={liveUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-[#A9681F]">
                View live <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </>
          )}
        </div>
        <PublishFlowButton siteId={siteId} alreadyPublished={siteStatus === "PUBLISHED"} />
      </div>
    </div>
  );
}

function SaveIndicator({ saveState, dirty }: { saveState: SaveState; dirty: boolean }) {
  if (saveState === "saving") {
    return (
      <span className="flex items-center gap-1.5 text-xs font-semibold text-[#756B5D]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Saving…
      </span>
    );
  }
  if (saveState === "error") {
    return (
      <span className="flex items-center gap-1.5 text-xs font-semibold text-red-600">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Couldn&apos;t save — try again
      </span>
    );
  }
  if (saveState === "saved") {
    return (
      <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
        <Check className="h-3.5 w-3.5" aria-hidden="true" /> Saved
      </span>
    );
  }
  if (dirty) {
    return <span className="text-xs font-semibold text-[#B4A896]">Unsaved changes</span>;
  }
  return null;
}
