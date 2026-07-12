"use client";

import { useRef, useState } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";
import { removeSiteAsset, uploadSiteAsset, type SiteAsset } from "@/lib/api";
import { AssetUploader } from "./asset-uploader";

interface MediaPanelProps {
  siteId: string;
  assets: SiteAsset[];
  onAssetsChange: (assets: SiteAsset[]) => void;
}

export function MediaPanel({ siteId, assets, onAssetsChange }: MediaPanelProps) {
  const logo = assets.find((a) => a.kind === "LOGO");
  const favicon = assets.find((a) => a.kind === "FAVICON");
  const hero = assets.find((a) => a.kind === "HERO");
  const heroBackground = assets.find((a) => a.kind === "HERO_BACKGROUND");
  const gallery = assets.filter((a) => a.kind === "GALLERY");

  function upsert(next: SiteAsset | null, kind: SiteAsset["kind"]) {
    const withoutKind = assets.filter((a) => a.kind !== kind);
    onAssetsChange(next ? [...withoutKind, next] : withoutKind);
  }

  return (
    <div className="flex flex-col gap-5">
      <AssetUploader siteId={siteId} kind="LOGO" label="Logo" currentAsset={logo} onChange={(a) => upsert(a, "LOGO")} />
      <AssetUploader siteId={siteId} kind="FAVICON" label="Favicon" currentAsset={favicon} onChange={(a) => upsert(a, "FAVICON")} />
      <AssetUploader siteId={siteId} kind="HERO" label="Hero image" currentAsset={hero} onChange={(a) => upsert(a, "HERO")} />
      <AssetUploader siteId={siteId} kind="HERO_BACKGROUND" label="Hero background image" currentAsset={heroBackground} onChange={(a) => upsert(a, "HERO_BACKGROUND")} />
      <GalleryUploader siteId={siteId} images={gallery} onChange={(next) => onAssetsChange([...assets.filter((a) => a.kind !== "GALLERY"), ...next])} />
    </div>
  );
}

function GalleryUploader({ siteId, images, onChange }: { siteId: string; images: SiteAsset[]; onChange: (next: SiteAsset[]) => void }) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList) {
    setUploading(true);
    try {
      const uploaded: SiteAsset[] = [];
      for (const file of Array.from(files)) {
        const { asset } = await uploadSiteAsset(siteId, "GALLERY", file);
        uploaded.push(asset);
      }
      onChange([...images, ...uploaded]);
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove(assetId: string) {
    await removeSiteAsset(siteId, assetId);
    onChange(images.filter((a) => a.id !== assetId));
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-[#171512]">Gallery photos ({images.length})</p>
      <div className="grid grid-cols-3 gap-2">
        {images.map((asset, index) => (
          <div key={asset.id} className="group relative aspect-square overflow-hidden rounded-xl border border-[#E7DDCF]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={asset.url} alt="" className="h-full w-full object-cover" />
            <span className="absolute left-1 top-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">#{index}</span>
            <button
              type="button"
              onClick={() => handleRemove(asset.id)}
              aria-label="Remove photo"
              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-[#E7DDCF] text-[#B4A896] disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Upload className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>
      <p className="text-xs text-[#8A7D6C]">Use a photo&apos;s # (shown above) in the &quot;Custom Text &amp; Image&quot; section&apos;s Gallery photo # field.</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
