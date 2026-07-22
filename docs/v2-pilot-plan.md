# V2 Pilot Plan — End-to-End Validation (Restaurant · Deli · Vape Shop)

> **Goal:** Prove the existing **Generation V2** pipeline produces correct,
> diverse, publishable storefronts for three real business types, using **only
> existing surfaces**.
>
> **Constraints (hard):** No new features. No rebuilds. No production-code
> changes. This plan runs and validates what already exists.

---

## 0. Scope & the three pilot businesses

| # | Business type | `BusinessType` enum | Why it's in the pilot |
|---|---|---|---|
| 1 | Restaurant | `RESTAURANT` | The baseline vertical — full menu, multiple categories |
| 2 | Deli | `DELI` | Distinct vocabulary + mixed price tier; tests vertical resolution |
| 3 | Vape Shop | `VAPE_SHOP` | **Compliance path** — age gate must be injected; consumable-dominant signals |

Each business is a `Restaurant` row (the physical tenant table) with its own
owner `User` and its own `Site`.

---

## 1. What "running V2 end-to-end" actually means

V2 is reached inside the **existing** generation job. `generator.ts:86` branches:

```
if (isGenerationV2Enabled(site.restaurantId)) → runV2()  → persists 3 schemaVersion-2 SiteVersions
else                                          → V1 theme path (unchanged)
```

So the pilot is: **flip the gate for exactly these 3 restaurant IDs**, run the
normal generate flow, and validate the persisted output.

Full path exercised (all pre-existing endpoints):

```
POST /api/auth/login                         → owner JWT
POST /api/imports (file|url)  → PATCH → approve   → live MenuCategory/MenuItem
POST /api/sites               → Site (DRAFT)
POST /api/sites/:id/generate  → GenerationJob → runV2 → 3× SiteVersion (schemaVersion 2)
GET  /api/sites/:id/generation → poll to COMPLETED
GET  /api/sites/:id/variations → the 3 storefronts
POST /api/sites/:id/variations/:vid/select    → chosen DRAFT
POST /api/sites/:id/versions/:vid/score       → SiteScore (works on v2 — closes the scoring gap, no code change)
POST /api/sites/:id/draft/render OR previewToken → rendered HTML for eyeball QA
```

---

## 2. Prerequisites

- **DB reachable:** `DATABASE_URL` set; migrations applied (`pnpm --filter api prisma migrate deploy`).
- **AI provider key set** (at least one; first configured wins: OpenAI → Anthropic → Gemini):
  `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY`.
  - If **no** key is set, V2 still runs via the **procedural floor** (deterministic
    briefs from evidence). Valid pilot, but validate the *AI path* separately with a key.
- **Image generation** stays OFF (default) — hero/category images fall back to
  stock/SVG. That is fine for a pipeline pilot.
- `psql` (or Prisma Studio) for output validation.

---

## 3. Enable V2 for exactly the three pilots (the only config change)

`GENERATION_V2_*` is an internal flag (not in `.env.example`). Set in the API
environment:

```bash
GENERATION_V2_ENABLED=true
GENERATION_V2_RESTAURANT_IDS=<restaurantId_restaurant>,<restaurantId_deli>,<restaurantId_vape>
```

Rules (from `v2/rollout.ts`): empty list = nobody (even when enabled); `*` = all
(use only on a throwaway/dev DB). **Scope to the 3 IDs** so no other business is
affected. **Rollback = unset `GENERATION_V2_ENABLED`** — V1 is byte-identical.

> Get the IDs after step 4:
> `SELECT id, name, "businessType" FROM "Restaurant" WHERE "businessType" IN ('RESTAURANT','DELI','VAPE_SHOP');`

---

## 4. Provision the three businesses (existing endpoints only)

For **each** business, using its own owner:

```bash
BASE=http://localhost:4000/api

# 4.1 Register + login the owner (repeat with distinct emails per business)
curl -s -X POST $BASE/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"restaurant.pilot@example.com","password":"Pilot!2345","name":"Pilot Restaurant"}'
TOKEN=$(curl -s -X POST $BASE/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"restaurant.pilot@example.com","password":"Pilot!2345"}' | jq -r '.token // .accessToken')

# 4.2 Ensure the Restaurant row carries the right businessType (via onboarding/restaurant update)
#     (Set businessType = RESTAURANT | DELI | VAPE_SHOP for the three respectively.)
```

> The onboarding wizard (`SetupStep`) is the normal way business type is set; for
> the pilot, set `Restaurant.businessType` for each of the three so vertical
> resolution and (for vape) the age gate behave correctly.

Then capture the three `restaurantId`s and fill them into step 3.

---

## 5. Run the pipeline per business

Repeat 5.1–5.6 for each of the three (as that owner):

```bash
# 5.1 Import a real menu (photo/PDF) OR a URL
IMPORT=$(curl -s -X POST $BASE/imports -H "Authorization: Bearer $TOKEN" \
  -F 'sourceType=IMAGE' -F 'file=@menu.jpg' | jq -r '.job.id // .id')

# 5.2 Poll until AWAITING_REVIEW
curl -s $BASE/imports/$IMPORT -H "Authorization: Bearer $TOKEN" | jq '.status, .extractedData.categories | length'

# 5.3 (optional) Correct extraction, then approve → commits MenuCategory/MenuItem
curl -s -X POST $BASE/imports/$IMPORT/approve -H "Authorization: Bearer $TOKEN"

# 5.4 Create the Site
SITE=$(curl -s -X POST $BASE/sites -H "Authorization: Bearer $TOKEN" | jq -r '.id // .site.id')

# 5.5 Generate — this is where V2 runs for allowlisted restaurants
curl -s -X POST $BASE/sites/$SITE/generate -H "Authorization: Bearer $TOKEN"   # → 202 { job }

# 5.6 Poll to COMPLETED, then list the 3 variations
curl -s $BASE/sites/$SITE/generation -H "Authorization: Bearer $TOKEN" | jq '.job.status,.job.stage'
curl -s $BASE/sites/$SITE/variations -H "Authorization: Bearer $TOKEN" | jq '.variations | length'
```

Then select one and score all three:

```bash
VID=$(curl -s $BASE/sites/$SITE/variations -H "Authorization: Bearer $TOKEN" | jq -r '.variations[0].id')
curl -s -X POST $BASE/sites/$SITE/variations/$VID/select -H "Authorization: Bearer $TOKEN"
# Score each version id (v2 supported by runScore via the theme carrier)
curl -s -X POST $BASE/sites/$SITE/versions/$VID/score -H "Authorization: Bearer $TOKEN" | jq '.score.overall'
```

Render for eyeball QA: `POST /api/sites/:id/draft/render` (or mint a preview token
and open `/preview/...`, proxied to the API).

---

## 6. Output validation — automated checks

Run these against the DB after each business generates. **All must pass.**

### 6.1 Three theme-free versions persisted

```sql
SELECT sv."versionNo", sv.status,
       sv.definition->>'schemaVersion'                AS schema_ver,   -- expect "2"
       sv.definition->'generation'->>'engine'         AS engine,       -- expect "v2"
       sv.definition->'generation'->>'briefId'        AS brief_id      -- expect 3 DISTINCT
FROM "SiteVersion" sv
JOIN "Site" s ON s.id = sv."siteId"
WHERE s."restaurantId" = :RID AND sv.status = 'VARIATION';
```
**Pass:** exactly 3 rows · `schema_ver = 2` · `engine = v2` · no `themeKey` present · 3 distinct `brief_id`.

### 6.2 Diversity — the three storefronts genuinely differ

```sql
SELECT sv."versionNo",
       sv.definition->'pages'->0->'sections'->1->>'type'      AS post_hero_section,  -- must differ pairwise
       sv.definition->'brandSettings'->>'backgroundColor'     AS bg,                 -- must differ
       sv.definition->'brandSettings'->>'headingFont'         AS display_font
FROM "SiteVersion" sv JOIN "Site" s ON s.id = sv."siteId"
WHERE s."restaurantId" = :RID AND sv.status = 'VARIATION'
ORDER BY sv."versionNo";
```
**Pass:** `post_hero_section` distinct across all 3 (enforced by the generator); backgrounds distinct; **at most one dark background** (the ≤1-dark-ground balance rule).

### 6.3 Vertical + vocabulary correctness

```sql
SELECT sv.definition->>'businessType'                        AS resolved_vertical,
       sv.definition->'vocabulary'->>'catalogNoun'           AS catalog_noun,
       sv.definition->'vocabulary'->>'primaryCta'            AS cta
FROM "SiteVersion" sv JOIN "Site" s ON s.id = sv."siteId"
WHERE s."restaurantId" = :RID AND sv.status = 'VARIATION' LIMIT 1;
```
**Pass:** vertical matches the business (RESTAURANT/DELI/VAPE_SHOP); vocabulary is vertical-appropriate.

### 6.4 Compliance — Vape only (**critical**)

```sql
SELECT sv."versionNo",
       jsonb_path_query_array(sv.definition->'pages'->0->'sections', '$[*].type') AS home_sections
FROM "SiteVersion" sv JOIN "Site" s ON s.id = sv."siteId"
WHERE s."restaurantId" = :VAPE_RID AND sv.status = 'VARIATION';
```
**Pass:** `ageGate` is present as the **first** home section in **all three** vape variations. (Restaurant/Deli must **not** have `ageGate`.)

### 6.5 No empty bands / live-data sections

**Pass:** no `bestSellers`, `offers`, `loyalty`, `reviews`, `appPromotion`,
`newsletter` in generated home sections (the planner drops live-data sections so a
brand-new business never renders an empty strip).

### 6.6 Renders without error + scored

- `POST /api/sites/:id/draft/render` returns a full `<!DOCTYPE html>` document (no thrown renderer error, no "unknown block").
- `POST /api/sites/:id/versions/:vid/score` returns an `overall` and writes a `SiteScore` row (`source = MANUAL`).

---

## 7. Per-module validation matrix

| Module | Where to look | Pass criteria |
|---|---|---|
| Business Intelligence | (not persisted — infer from output) resolved vertical, price-tier-driven CTA/copy | Vertical correct; occasion/consumable signals reflected in the angle chosen |
| CreativeBrief | 3 distinct `brief_id`; `origin` in job logs | 3 briefs; post-hero section differs; ≤1 dark ground; AI path used when a key is set (else procedural — still valid) |
| StorefrontPlan | `definition.pages[]` | 4 pages (/, /menu, /about, /contact); data-less sections dropped; vape age gate added |
| SiteDefinition | `definition.schemaVersion`, `generation` | schemaVersion 2, engine v2, no themeKey |
| Renderer Registry | `POST .../draft/render` output | Full HTML, every section type resolves, graceful on unknowns |
| Scoring | `SiteScore` after manual score | Row created for v2 via the theme carrier |

---

## 8. Pilot scorecard (fill during the run)

| Check | Restaurant | Deli | Vape |
|---|---|---|---|
| 3 variations, schemaVersion 2 | ☐ | ☐ | ☐ |
| 3 distinct briefs | ☐ | ☐ | ☐ |
| Post-hero section differs pairwise | ☐ | ☐ | ☐ |
| ≤1 dark background | ☐ | ☐ | ☐ |
| Correct vertical + vocabulary | ☐ | ☐ | ☐ |
| Age gate present (vape) / absent (others) | n/a absent | n/a absent | ☐ present |
| No empty live-data bands | ☐ | ☐ | ☐ |
| Renders to full HTML | ☐ | ☐ | ☐ |
| Manual score returns overall | ☐ | ☐ | ☐ |
| Eyeball QA: looks publishable | ☐ | ☐ | ☐ |

**Exit criteria:** all boxes checked for all three, with no renderer errors and no
compliance miss on vape.

---

## 9. Known limitations to record during the pilot (do not fix here)

These are **observations to log**, consistent with "no features / no rebuild":

1. **Services are not inferred** — `runV2` doesn't pass `services`, so
   understanding defaults to pickup-only. Delivery/dine-in/reservations copy may be
   off. (Observe, don't fix.)
2. **Understanding & briefs are not persisted** — only `SiteVersion.definition` is
   stored. Validate BI/brief quality *through the compiled output* (§7), or read
   the generation job logs. The `runV2Shadow` harness exists but has **no caller**,
   so it can't be triggered without adding code — out of scope for this pilot.
3. **Automatic scoring is skipped in `runV2`** — the pilot scores **manually** via
   the existing endpoint. Note this for the roadmap.
4. **Upload source is passed as `"mixed"`** — the true source type/locale isn't
   threaded into understanding.

---

## 10. Rollback

Unset `GENERATION_V2_ENABLED` (or clear `GENERATION_V2_RESTAURANT_IDS`). The next
generation for those businesses returns to the V1 path, unchanged. Existing V2
`SiteVersion` rows remain valid and renderable.

---

*Validation-only runbook. Exercises existing endpoints and existing generation
code; introduces no features and modifies no production code.*
