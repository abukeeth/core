import { Role } from "@prisma/client";
import { Router } from "express";
import multer from "multer";
import { getNumberEnv } from "../../config/env";
import { contactFormRateLimiter, siteGenerationRateLimiter } from "../../middleware/rate-limit";
import { requireAuth } from "../../middleware/require-auth";
import { requireRole } from "../../middleware/require-role";
import { upload as uploadAssetHandler, list as listAssetsHandler, update as updateAssetHandler, remove as removeAssetHandler } from "./asset.controller";
import { list as listMessagesHandler, submit as submitContactHandler } from "./contact.controller";
import { list as listNewsletterSubscribersHandler, subscribe as subscribeNewsletterHandler } from "./newsletter.controller";
import {
  add as addDomainHandler,
  history as domainHistoryHandler,
  list as listDomainsHandler,
  remove as removeDomainHandler,
  setPrimary as setPrimaryDomainHandler,
  verify as verifyDomainHandler,
} from "./domain.controller";
import {
  generate,
  generationStatus,
  listVariationsHandler,
  regenerate,
  selectVariationHandler,
} from "./generation.controller";
import { applyFix, getHistory, getLatest, run as runScoreHandler } from "./score.controller";
import {
  checkPublishReadiness,
  create,
  getMine,
  getVersionHandler,
  listReleasesHandler,
  listVersionsHandler,
  patchDraftHandler,
  previewToken,
  publish,
  renderDraftPreviewHandler,
  rollback,
  unpublish,
  update as updateSiteHandler,
} from "./site.controller";

const MAX_ASSET_SIZE_BYTES = getNumberEnv("SITE_MAX_ASSET_SIZE_BYTES", 8 * 1024 * 1024);
const ALLOWED_ASSET_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

const assetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ASSET_SIZE_BYTES },
  fileFilter: (_req, file, callback) => {
    callback(null, ALLOWED_ASSET_MIME_TYPES.has(file.mimetype));
  },
});

export const siteRouter = Router();
export const publicSiteRouter = Router();

const staffOrOwner = requireRole(Role.RESTAURANT_OWNER, Role.RESTAURANT_STAFF);

// Website Hub / core site
siteRouter.get("/me", requireAuth, staffOrOwner, getMine);
siteRouter.post("/", requireAuth, staffOrOwner, create);
siteRouter.patch("/:id", requireAuth, staffOrOwner, updateSiteHandler);

// Generation & variations
siteRouter.post("/:id/generate", requireAuth, staffOrOwner, siteGenerationRateLimiter, generate);
siteRouter.get("/:id/generation", requireAuth, staffOrOwner, generationStatus);
siteRouter.get("/:id/variations", requireAuth, staffOrOwner, listVariationsHandler);
siteRouter.post("/:id/variations/:vid/select", requireAuth, staffOrOwner, selectVariationHandler);
siteRouter.post("/:id/variations/regenerate", requireAuth, staffOrOwner, siteGenerationRateLimiter, regenerate);

// Versions & constrained editing
siteRouter.get("/:id/versions", requireAuth, staffOrOwner, listVersionsHandler);
siteRouter.get("/:id/versions/:vid", requireAuth, staffOrOwner, getVersionHandler);
siteRouter.patch("/:id/draft", requireAuth, staffOrOwner, patchDraftHandler);
siteRouter.post("/:id/draft/render", requireAuth, staffOrOwner, renderDraftPreviewHandler);

// Scoring
siteRouter.post("/:id/versions/:vid/score", requireAuth, staffOrOwner, runScoreHandler);
siteRouter.get("/:id/versions/:vid/score", requireAuth, staffOrOwner, getLatest);
siteRouter.get("/:id/versions/:vid/score/history", requireAuth, staffOrOwner, getHistory);
siteRouter.post("/:id/versions/:vid/suggestions/apply", requireAuth, staffOrOwner, applyFix);

// Assets
siteRouter.post("/:id/assets", requireAuth, staffOrOwner, assetUpload.single("file"), uploadAssetHandler);
siteRouter.get("/:id/assets", requireAuth, staffOrOwner, listAssetsHandler);
siteRouter.patch("/:id/assets/:assetId", requireAuth, staffOrOwner, updateAssetHandler);
siteRouter.delete("/:id/assets/:assetId", requireAuth, staffOrOwner, removeAssetHandler);

siteRouter.get("/:id/preview-token", requireAuth, staffOrOwner, previewToken);

// Publish & domains
siteRouter.get("/:id/publish-check", requireAuth, staffOrOwner, checkPublishReadiness);
siteRouter.post("/:id/publish", requireAuth, staffOrOwner, publish);
siteRouter.get("/:id/releases", requireAuth, staffOrOwner, listReleasesHandler);
siteRouter.post("/:id/rollback/:vid", requireAuth, staffOrOwner, rollback);
siteRouter.post("/:id/unpublish", requireAuth, staffOrOwner, unpublish);

siteRouter.post("/:id/domains", requireAuth, staffOrOwner, addDomainHandler);
siteRouter.get("/:id/domains", requireAuth, staffOrOwner, listDomainsHandler);
siteRouter.get("/:id/domain-history", requireAuth, staffOrOwner, domainHistoryHandler);
siteRouter.post("/:id/domains/:did/verify", requireAuth, staffOrOwner, verifyDomainHandler);
siteRouter.post("/:id/domains/:did/primary", requireAuth, staffOrOwner, setPrimaryDomainHandler);
siteRouter.delete("/:id/domains/:did", requireAuth, staffOrOwner, removeDomainHandler);

// Messages (dashboard inbox)
siteRouter.get("/:id/messages", requireAuth, staffOrOwner, listMessagesHandler);
siteRouter.get("/:id/newsletter-subscribers", requireAuth, staffOrOwner, listNewsletterSubscribersHandler);

// Public, unauthenticated
publicSiteRouter.post("/:id/contact", contactFormRateLimiter, submitContactHandler);
publicSiteRouter.post("/:id/newsletter", contactFormRateLimiter, subscribeNewsletterHandler);
