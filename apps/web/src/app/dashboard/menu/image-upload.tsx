"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { uploadCategoryImage, uploadMenuItemImage } from "@/lib/api";

interface MenuImageUploadProps {
  entity: "category" | "item";
  entityId: string;
  imageUrl: string | null;
}

/** §Website Builder — lets an owner attach a real photo to a menu category/item, feeding the same imageKey/imageUrl the storefront renderer already knows how to show (real photo, or a polished fallback tile when absent). */
export function MenuImageUpload({ entity, entityId, imageUrl }: MenuImageUploadProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      if (entity === "category") {
        await uploadCategoryImage(entityId, file);
      } else {
        await uploadMenuItemImage(entityId, file);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-dashed border-black/[.15] text-[10px] text-zinc-400 dark:border-white/[.2]">
          No photo
        </div>
      )}
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="text-xs font-medium text-zinc-600 underline disabled:opacity-50 dark:text-zinc-400"
      >
        {uploading ? "Uploading…" : imageUrl ? "Change photo" : "Add photo"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void handleFile(file);
        }}
      />
    </div>
  );
}
