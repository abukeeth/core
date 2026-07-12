import { ImportSourceType } from "@prisma/client";
import type { AIMediaType } from "../../../lib/ai";
import { extractMenuFromImages } from "../vision-extractor";
import type { ExtractedMenuData, ImportAdapter, ImportSourceInput } from "../types";

const SUPPORTED_MIME_TYPES: AIMediaType[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

export class ImageImportAdapter implements ImportAdapter {
  readonly sourceType = ImportSourceType.IMAGE;
  readonly implemented = true;
  readonly inputKind = "file" as const;

  async extract(input: ImportSourceInput): Promise<ExtractedMenuData> {
    if (input.kind !== "file") {
      throw new Error("Image import requires a file upload");
    }

    const mediaType = SUPPORTED_MIME_TYPES.find((type) => type === input.mimeType);
    if (!mediaType) {
      throw new Error(`Unsupported image type: ${input.mimeType}`);
    }

    return extractMenuFromImages([input.buffer], mediaType);
  }
}
