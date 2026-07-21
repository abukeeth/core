# AI Branding Layer — Provider Validation Runbook

How to configure and validate the AI image-generation provider that produces
the Hero / Category / Marketing imagery for generated storefronts.

**Status at time of writing:** The pipeline is complete and integration-tested
(PR 5.5.4). Backends registered behind `lib/ai/image/`: **`stability`** (hosted,
recommended default) and **`local`** (procedural, offline/dev/demo). A live
external-provider validation has **not** been run yet — it requires an API key
**and** network egress to the provider (both absent in the current sandbox,
where `api.stability.ai` is blocked by network policy). This document is the
exact procedure to run it where those are available.

**Guardrails preserved by the pipeline (do not remove):** no product-tile AI
images; no branded-SKU / logo / text embedded in generated imagery (enforced via
the negative prompt); real owner/imported photos always take priority over AI;
generated assets are cached and persisted; AI failure falls back to stock → SVG.

---

## 1. Required environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `AI_IMAGE_ENABLED` | yes | `false` | Master flag. When `false`, no images are generated (safe no-op → stock/SVG). |
| `AI_IMAGE_BACKEND` | yes | `stability` | Default backend name. Registered names: `stability`, `local`. |
| `AI_IMAGE_ROUTES` | no | — | Per-vertical overrides, e.g. `VAPE_SHOP=stability,COFFEE_SHOP=openai`. |
| `AI_IMAGE_TIMEOUT_MS` | no | `30000` | Per-image generation timeout. |
| `AI_IMAGE_MAX_PER_BUSINESS` | no | `10` | Hard cost cap (images/business). Hero + ≤8 category + marketing ≈ 6. |
| `STABILITY_API_KEY` | for `stability` | — | Stability API key (**never commit; omit in logs**). |
| `STABILITY_ENDPOINT` | no | `https://api.stability.ai/v2beta/stable-image/generate/core` | Override endpoint if needed. |
| `OPENAI_API_KEY` | for `openai`* | — | Only if an OpenAI image backend is registered (see §4). |

**Persistence (so assets survive restarts and are reused):** configure
S3-compatible object storage per `docs/runbooks/object-storage.md`. If object
storage is not configured, the store falls back to local disk under
`IMPORT_UPLOAD_DIR` (default `uploads/`) — durable across restarts on a
persistent volume, but not across ephemeral containers.

**Network egress:** the provider host must be reachable. In a policy-restricted
environment, allowlist `api.stability.ai` (or the configured provider host). See
the network-policy docs at
`https://code.claude.com/docs/en/claude-code-on-the-web`.

---

## 2. Provider configuration examples

### Stability (recommended default — permissive enough for VAPE_SHOP)
```bash
AI_IMAGE_ENABLED=true
AI_IMAGE_BACKEND=stability
STABILITY_API_KEY=****           # omitted
# optional:
AI_IMAGE_TIMEOUT_MS=45000
AI_IMAGE_MAX_PER_BUSINESS=10
```

### Local (offline / dev / demo — no key, no network, procedural imagery)
```bash
AI_IMAGE_ENABLED=true
AI_IMAGE_BACKEND=local
```

---

## 3. Stability routing configuration

Route the restricted-goods vertical (vape) to Stability explicitly — its content
policy tolerates the atmospheric vape prompts that OpenAI/Imagen typically refuse:
```bash
AI_IMAGE_BACKEND=stability            # default for everything
AI_IMAGE_ROUTES=VAPE_SHOP=stability   # explicit pin (belt-and-suspenders)
STABILITY_API_KEY=****
```
The exact request the backend sends (key omitted):
```
POST https://api.stability.ai/v2beta/stable-image/generate/core
Headers: Authorization: Bearer ****   Accept: image/*
multipart/form-data: prompt, negative_prompt, output_format=png,
                     aspect_ratio (16:9 hero/marketing | 9:16 category), seed
```
Error handling (already implemented): `429 → rate_limited`, `403 /
finish-reason=CONTENT_FILTERED → content_rejected`, `5xx → retryable
provider_error`; all fall back to stock → SVG.

---

## 4. OpenAI routing configuration

Use OpenAI for **non-restricted** verticals (food/coffee/deli/retail) where its
fidelity is strong; never route `VAPE_SHOP` to it (tobacco/vape content is
refused).
```bash
AI_IMAGE_BACKEND=stability
AI_IMAGE_ROUTES=COFFEE_SHOP=openai,DELI=openai,RESTAURANT=openai,RETAIL=openai
OPENAI_API_KEY=****
```
> **Prerequisite:** an OpenAI **image** backend must be registered first. Today
> only `stability` and `local` are in the backend registry (`lib/ai/image/index.ts`),
> and the OpenAI provider under `lib/ai/` is text/vision only. Registering it is
> additive — one class under `lib/ai/image/providers/openai-image.ts` + one line
> in the `BACKENDS` map — with **no** change to branding or generation code.
> Until then, routing a vertical to `openai` raises `not_configured` (which falls
> back safely). This is a follow-up, not part of this validation.

---

## 5. Production validation checklist

- [ ] Object storage configured (or a durable disk volume) — assets persist.
- [ ] `AI_IMAGE_ENABLED=true`, `AI_IMAGE_BACKEND` set, provider key present.
- [ ] Network egress to the provider host allowlisted.
- [ ] Generate a **menu-only** business (no logo, no photos) per vertical.
- [ ] Hero image is photographic, premium, on-brand (palette-consistent), **no text/logo/people**.
- [ ] One category image per main category (up to 8), on-brand, no text/logo.
- [ ] 1 marketing/gallery banner present.
- [ ] **Product tiles show the monogram tile or a real photo — never an AI image.**
- [ ] No branded SKU / packaging / logo / claim appears in any generated image.
- [ ] Re-run generation for the same business → **0 new images** (cache hit).
- [ ] Restart the process → assets still resolve (persistence).
- [ ] Upload a real owner photo → it **replaces** the AI image for that surface.
- [ ] Force a provider error (bad key) → storefront still renders (stock/SVG fallback).
- [ ] Record actual **cost, latency, asset count** (see §6/§7).
- [ ] Capture desktop + mobile screenshots against the reference standard
      (premium · photographic · custom-branded · commercially presentable).

---

## 6. Expected costs (estimates — substitute your plan's rate)

- Stable Image Core ≈ **3 credits ≈ $0.03 / image** (verify against your plan).
- Per business: **~6 images** (1 hero + up to 4–8 category + 1 marketing) →
  **~$0.18 / business**, generated **once** and cached.
- Cost scales with **number of businesses, not catalog size or variations**
  (assets are shared across all 3 variations and every render).
- 1,000 businesses ≈ **$180**; 10,000 ≈ **$1,800** (one-time per business).
- Product tiles cost **$0** (never AI-generated).

## 7. Expected latency (estimates)

- ~**3–8 s per image** (provider-dependent).
- Full set per business, parallelized across surfaces: **~10–20 s**.
- Generation runs in the durable background job (does not block the HTTP
  response); cache hits are effectively instant.

---

## 8. Exact steps to run the validation (when API access is available)

1. **Set env** (in the API service):
   ```bash
   export AI_IMAGE_ENABLED=true
   export AI_IMAGE_BACKEND=stability
   export AI_IMAGE_ROUTES=VAPE_SHOP=stability
   export STABILITY_API_KEY=****          # omitted
   # object storage configured per docs/runbooks/object-storage.md
   ```
2. **Confirm egress:** `curl -I https://api.stability.ai` returns a non-403
   (allowlist the host if it does not).
3. **Generate a menu-only Vape business** through the normal flow (import a menu
   photo/PDF/URL for a vape shop with no logo and no photos) and run site
   generation — the brand stage generates hero/category/marketing once.
4. **Verify** against the §5 checklist; capture the actual cost, latency, and
   asset/cache counts the job logs.
5. **Screenshots:** open the published/preview storefront and capture desktop +
   mobile home, the hero, the category section, the marketing/gallery band, and
   the catalog page.
6. **Pass criteria:** imagery is premium, photographic, custom-branded, and
   commercially presentable; all §5 guardrails hold.

> Switching providers later (e.g. adding OpenAI for food verticals, or a
> different backend entirely) is **config-only** via `AI_IMAGE_BACKEND` /
> `AI_IMAGE_ROUTES` — no branding or generation code changes.
