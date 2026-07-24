"use client";

import { useState } from "react";
import {
  createConsolidatedImport,
  createRestaurant,
  updateRestaurant,
  type BusinessType,
  type ImportJob,
  type Restaurant,
} from "@/lib/api";
import { downscaleImageFile } from "@/lib/image-downscale";
import { BUSINESS_TYPES } from "../business-types";
import { primaryButtonClass, secondaryButtonClass } from "../wizard-shell";

const ACCEPTED_FILE_TYPES = "application/pdf,image/png,image/jpeg,image/webp,image/gif";
// Mirrors the API's IMPORT_MAX_CONSOLIDATED_FILES default (import.routes.ts).
const MAX_FILES = 30;
const IMAGE_MIME_PREFIX = "image/";

function isImage(file: File): boolean {
  return file.type.startsWith(IMAGE_MIME_PREFIX);
}

/**
 * Onboarding V3 — Screen 1 (Create). One screen that gathers everything the
 * "Analyze My Business" step needs: the business type, and any sources to read
 * the menu from (photos + PDFs, a website URL, a Google Maps URL). Submitting
 * creates the store (once) and one consolidated import job, then hands off to
 * the review screen. Everything except a business type and at least one source
 * is optional — Stripe, delivery, taxes, and hours are intentionally NOT here
 * (new stores open 24/7 by default; the owner refines them later in Settings).
 */
export function CreateBusinessScreen({
  restaurant,
  onAnalyzed,
  onSkip,
}: {
  /** An already-created store (resume / retry) so we never re-create and 409. */
  restaurant: Restaurant | null;
  onAnalyzed: (restaurant: Restaurant, job: ImportJob) => void;
  /** Skip AI import — create the store and go straight to build; the owner adds the menu manually. */
  onSkip: (restaurant: Restaurant) => void;
}) {
  const [businessType, setBusinessType] = useState<BusinessType | null>(restaurant?.businessType ?? null);
  const [files, setFiles] = useState<File[]>([]);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [googleMapsUrl, setGoogleMapsUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasSource = files.length > 0 || websiteUrl.trim() !== "" || googleMapsUrl.trim() !== "";
  const canSubmit = businessType !== null && hasSource && !submitting;

  function addFiles(selected: FileList | null) {
    if (!selected) return;
    setError(null);
    setFiles((prev) => {
      const combined = [...prev, ...Array.from(selected)];
      if (combined.length > MAX_FILES) {
        setError(`You can upload up to ${MAX_FILES} files. Keeping the first ${MAX_FILES}.`);
        return combined.slice(0, MAX_FILES);
      }
      return combined;
    });
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  // Create the store on first submit; reuse it on a retry/resume, updating the
  // type only if the owner changed their pick (never re-creating and 409-ing).
  async function ensureStore(): Promise<Restaurant> {
    let store = restaurant;
    if (!store) {
      ({ restaurant: store } = await createRestaurant({ businessType: businessType! }));
    } else if (store.businessType !== businessType) {
      ({ restaurant: store } = await updateRestaurant({ businessType: businessType! }));
    }
    return store;
  }

  // Skip AI import entirely — the store still needs a business type, but no
  // sources and no AI key are required. Goes straight to build; the owner adds
  // their menu manually from the dashboard afterwards.
  async function handleSkip() {
    if (!businessType) return;
    setSubmitting(true);
    setError(null);
    try {
      onSkip(await ensureStore());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't continue. Please try again.");
      setSubmitting(false);
    }
  }

  async function handleAnalyze() {
    if (!businessType || !hasSource) return;
    setSubmitting(true);
    setError(null);
    try {
      const store = await ensureStore();

      // Shrink large phone photos on-device first — smaller upload, faster
      // vision analysis. Fail-open (downscale returns the original on any issue).
      const prepared = await Promise.all(files.map((file) => (isImage(file) ? downscaleImageFile(file) : Promise.resolve(file))));

      const { job } = await createConsolidatedImport({
        files: prepared,
        websiteUrl: websiteUrl.trim() || undefined,
        googleMapsUrl: googleMapsUrl.trim() || undefined,
      });
      onAnalyzed(store, job);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't analyze your business. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">CREATE YOUR BUSINESS</p>
      <h1 className="mt-2 text-3xl font-display font-semibold tracking-tight">Let&apos;s build your storefront</h1>
      <p className="mt-3 text-sm leading-6 text-ink-secondary">
        Pick your business type and add anything we can read your menu from — photos, a PDF, your website, or a Google
        listing. OrderVora analyzes it all and builds your storefront for you.
      </p>

      {error && <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</p>}

      <div className="mt-6">
        <h2 className="text-sm font-bold text-ink">Business type</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {BUSINESS_TYPES.map((type) => (
            <button
              key={type.value}
              type="button"
              onClick={() => setBusinessType(type.value)}
              disabled={submitting}
              aria-pressed={businessType === type.value}
              className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-center text-sm font-bold transition active:scale-[0.98] disabled:opacity-50 ${
                businessType === type.value ? "border-brand bg-brand text-white" : "border-line bg-subtle text-ink hover:bg-surface"
              }`}
            >
              <span className="text-2xl" aria-hidden="true">
                {type.icon}
              </span>
              {type.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-bold text-ink">Add your menu sources</h2>
        <p className="mt-1 text-xs leading-5 text-ink-secondary">
          Upload up to {MAX_FILES} menu photos or PDFs. We analyze the clearest ones and keep the rest for your gallery.
        </p>

        <label className="mt-3 flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line bg-subtle px-4 text-center text-sm font-semibold text-ink-secondary">
          <input
            type="file"
            accept={ACCEPTED_FILE_TYPES}
            multiple
            className="hidden"
            disabled={submitting}
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <span className="text-2xl" aria-hidden="true">
            📷
          </span>
          Tap to add menu photos or PDFs
        </label>

        {files.length > 0 && (
          <ul className="mt-3 space-y-2">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`} className="flex items-center gap-3 rounded-xl border border-line bg-subtle px-3 py-2">
                <span className="text-lg" aria-hidden="true">
                  {isImage(file) ? "🖼️" : "📄"}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{file.name}</span>
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  disabled={submitting}
                  aria-label={`Remove ${file.name}`}
                  className="shrink-0 rounded-lg px-2 py-1 text-sm font-bold text-ink-secondary hover:text-danger disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-8 space-y-4">
        <h2 className="text-sm font-bold text-ink">Or paste a link (optional)</h2>
        <label className="block">
          <span className="text-xs font-semibold text-ink-secondary">Website URL</span>
          <input
            type="url"
            inputMode="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            disabled={submitting}
            placeholder="https://your-restaurant.com"
            className="mt-1.5 min-h-12 w-full rounded-2xl border border-line bg-surface px-4 text-base outline-none transition focus:border-brand disabled:opacity-50"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-ink-secondary">Google Maps / Business URL</span>
          <input
            type="url"
            inputMode="url"
            value={googleMapsUrl}
            onChange={(e) => setGoogleMapsUrl(e.target.value)}
            disabled={submitting}
            placeholder="https://maps.google.com/…"
            className="mt-1.5 min-h-12 w-full rounded-2xl border border-line bg-surface px-4 text-base outline-none transition focus:border-brand disabled:opacity-50"
          />
        </label>
      </div>

      <div className="mt-8 space-y-3">
        <button type="button" onClick={handleAnalyze} disabled={!canSubmit} className={primaryButtonClass}>
          {submitting ? "Analyzing…" : "Analyze My Business"}
        </button>
        {!hasSource && (
          <p className="text-center text-xs text-ink-secondary">
            Add at least one source — a photo, a PDF, a website, or a Google link.
          </p>
        )}
        {/* Manual path: no sources and no AI key required — go straight to
            build and add the menu by hand. Needs only a business type. */}
        <button
          type="button"
          onClick={handleSkip}
          disabled={businessType === null || submitting}
          className={secondaryButtonClass}
        >
          Skip — I&apos;ll add my menu manually
        </button>
      </div>
    </div>
  );
}
