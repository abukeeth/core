"use client";

import { useRef, useState } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";
import { removeSiteAsset, uploadSiteAsset, type SiteAsset, type SiteAssetKind } from "@/lib/api";

interface AssetUploaderProps {
  siteId: string;
  kind: SiteAssetKind;
  label: string;
  currentAsset: SiteAsset | undefined;
  onChange: (asset: SiteAsset | null) => void;
}

/** Uploads always create a new row (asset.service.ts has no "replace" concept), so a one-per-kind slot removes the previous asset of that kind before uploading the replacement — keeps this genuinely a single "Logo"/"Favicon"/"Hero" slot from the owner's point of view. */
export function AssetUploader({ siteId, kind, label, currentAsset, onChange }: AssetUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      if (currentAsset) {
        await removeSiteAsset(siteId, currentAsset.id);
      }
      const { asset } = await uploadSiteAsset(siteId, kind, file);
      onChange(asset);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    if (!currentAsset) return;
    setUploading(true);
    try {
      await removeSiteAsset(siteId, currentAsset.id);
      onChange(null);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-[#171512]">{label}</p>
      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
      <div className="flex items-center gap-3">
        {currentAsset ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={currentAsset.url} alt={label} className="h-16 w-16 shrink-0 rounded-xl border border-[#E7DDCF] object-cover" />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-dashed border-[#E7DDCF] text-[#B4A896]">
            <Upload className="h-5 w-5" aria-hidden="true" />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="flex min-h-9 items-center gap-1.5 rounded-full border border-[#E7DDCF] bg-white px-3 text-xs font-bold text-[#171512] disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Upload className="h-3.5 w-3.5" aria-hidden="true" />}
            {currentAsset ? "Replace" : "Upload"}
          </button>
          {currentAsset && (
            <button type="button" disabled={uploading} onClick={handleRemove} className="flex min-h-9 items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-700 disabled:opacity-50">
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Remove
            </button>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
