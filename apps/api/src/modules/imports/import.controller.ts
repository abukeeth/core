import type { Request, Response } from "express";
import { NoRestaurantError } from "../restaurants/restaurant.errors";
import { getOwnRestaurantId } from "../restaurants/restaurant.service";
import { importAdapterRegistry } from "./adapters/registry";
import { ImportJobEmptyMenuError, ImportJobNotFoundError, ImportJobNotReadyError, ImportJobNotRerunnableError } from "./import.errors";
import { approveJob, createConsolidatedImportJob, createImportJob, getJob, listJobs, rejectJob, rerunJob, updateJobData, type UploadedFile } from "./import.service";
import { extractedMenuDataSchema } from "./types";
import { consolidatedImportSchema, createImportSchema } from "./import.validation";

const RASTER_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

function paramId(req: Request): string {
  return req.params.id as string;
}

async function requireOwnRestaurantId(req: Request, res: Response): Promise<string | null> {
  const restaurantId = await getOwnRestaurantId(req.user!.id);
  if (!restaurantId) {
    res.status(404).json({ error: new NoRestaurantError().message });
    return null;
  }
  return restaurantId;
}

export async function create(req: Request, res: Response): Promise<void> {
  const parsed = createImportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  const adapter = importAdapterRegistry.get(parsed.data.sourceType);
  if (!adapter?.implemented) {
    res.status(501).json({ error: `Import source "${parsed.data.sourceType}" is not implemented yet` });
    return;
  }

  if (adapter.inputKind === "file" && !req.file) {
    res.status(400).json({ error: "A file upload is required for this import source" });
    return;
  }

  if (adapter.inputKind === "url" && !parsed.data.sourceUrl) {
    res.status(400).json({ error: "A sourceUrl is required for this import source" });
    return;
  }

  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const job = await createImportJob(
    restaurantId,
    req.user!.id,
    parsed.data,
    req.file
      ? { buffer: req.file.buffer, mimeType: req.file.mimetype, originalName: req.file.originalname }
      : undefined,
  );

  res.status(202).json({ job });
}

/**
 * Onboarding V3 — "Analyze My Business". Accepts up to 30 files (images + PDFs)
 * plus optional website / Google Maps URLs, and creates ONE consolidated import
 * job. Non-image/PDF files (e.g. a stray CSV) are ignored rather than rejected,
 * so a good upload isn't blocked by one odd file.
 */
export async function createConsolidated(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = consolidatedImportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const images: UploadedFile[] = [];
  const pdfs: UploadedFile[] = [];
  for (const file of files) {
    const uploaded: UploadedFile = { buffer: file.buffer, mimeType: file.mimetype, originalName: file.originalname };
    if (file.mimetype === "application/pdf") {
      pdfs.push(uploaded);
    } else if (RASTER_IMAGE_MIME_TYPES.has(file.mimetype)) {
      images.push(uploaded);
    }
  }

  if (images.length === 0 && pdfs.length === 0 && !parsed.data.websiteUrl && !parsed.data.googleMapsUrl) {
    res.status(400).json({ error: "Upload at least one source — an image, a PDF, a website URL, or a Google Maps URL." });
    return;
  }

  const job = await createConsolidatedImportJob(restaurantId, req.user!.id, {
    images,
    pdfs,
    websiteUrl: parsed.data.websiteUrl,
    googleMapsUrl: parsed.data.googleMapsUrl,
  });

  res.status(202).json({ job });
}

export async function list(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const jobs = await listJobs(restaurantId);
  res.status(200).json({ jobs });
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    const job = await getJob(restaurantId, paramId(req));
    res.status(200).json({ job });
  } catch (err) {
    if (err instanceof ImportJobNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

/** Lets the reviewer persist edits (bulk category move, delete, fix a name/price) before approving. */
export async function updateData(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = extractedMenuDataSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const job = await updateJobData(restaurantId, paramId(req), parsed.data);
    res.status(200).json({ job });
  } catch (err) {
    if (err instanceof ImportJobNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof ImportJobNotReadyError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function approve(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    const job = await approveJob(restaurantId, paramId(req));
    res.status(200).json({ job });
  } catch (err) {
    if (err instanceof ImportJobNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof ImportJobNotReadyError) {
      res.status(409).json({ error: err.message });
      return;
    }
    if (err instanceof ImportJobEmptyMenuError) {
      res.status(422).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function reject(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    const job = await rejectJob(restaurantId, paramId(req));
    res.status(200).json({ job });
  } catch (err) {
    if (err instanceof ImportJobNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function rerun(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    const job = await rerunJob(restaurantId, paramId(req));
    res.status(202).json({ job });
  } catch (err) {
    if (err instanceof ImportJobNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof ImportJobNotRerunnableError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
}
