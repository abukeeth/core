import type { ImportSourceType } from "@prisma/client";
import type { ImportAdapter } from "../types";
import { CsvImportAdapter } from "./csv.adapter";
import { DoorDashImportAdapter } from "./doordash.adapter";
import { GoogleMapsImportAdapter } from "./google-maps.adapter";
import { GrubhubImportAdapter } from "./grubhub.adapter";
import { ImageImportAdapter } from "./image.adapter";
import { PdfImportAdapter } from "./pdf.adapter";
import { UberEatsImportAdapter } from "./uber-eats.adapter";
import { WebsiteImportAdapter } from "./website.adapter";

class ImportAdapterRegistry {
  private readonly adapters = new Map<ImportSourceType, ImportAdapter>();

  register(adapter: ImportAdapter): void {
    this.adapters.set(adapter.sourceType, adapter);
  }

  get(sourceType: ImportSourceType): ImportAdapter | undefined {
    return this.adapters.get(sourceType);
  }
}

export const importAdapterRegistry = new ImportAdapterRegistry();

// Registered once, at module load. Adding a new source later is: write
// one adapter class + one `.register(new XAdapter())` line here.
importAdapterRegistry.register(new PdfImportAdapter());
importAdapterRegistry.register(new ImageImportAdapter());
importAdapterRegistry.register(new CsvImportAdapter());
importAdapterRegistry.register(new WebsiteImportAdapter());
importAdapterRegistry.register(new GoogleMapsImportAdapter());
importAdapterRegistry.register(new DoorDashImportAdapter());
importAdapterRegistry.register(new UberEatsImportAdapter());
importAdapterRegistry.register(new GrubhubImportAdapter());
