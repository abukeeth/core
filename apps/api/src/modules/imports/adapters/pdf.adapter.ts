import { ImportSourceType } from "@prisma/client";
import { extractMenuFromImages } from "../vision-extractor";
import type { ExtractedMenuData, ImportAdapter, ImportSourceInput } from "../types";

export class PdfImportAdapter implements ImportAdapter {
  readonly sourceType = ImportSourceType.PDF;
  readonly implemented = true;
  readonly inputKind = "file" as const;

  async extract(input: ImportSourceInput): Promise<ExtractedMenuData> {
    if (input.kind !== "file") {
      throw new Error("PDF import requires a file upload");
    }

    // pdf-to-img is ESM-only; dynamic import avoids a require()/ESM
    // mismatch from this CommonJS-compiled module.
    const { pdf } = await import("pdf-to-img");
    const document = await pdf(input.buffer);

    const pageImages: Buffer[] = [];
    for await (const page of document) {
      pageImages.push(page);
    }

    return extractMenuFromImages(pageImages, "image/png");
  }
}
