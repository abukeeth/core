import { z } from "zod";

/**
 * Single source of truth for environment configuration (Production
 * Hardening Phase 3). Before this module existed, five different files
 * (lib/jwt.ts, lib/encryption.ts, customer-jwt.ts, prisma/seed.ts,
 * notifications/providers/email.provider.ts) each defined their own local
 * copy of the same "read one env var, throw if missing" helper — this
 * module consolidates that into one implementation, plus a validated,
 * typed schema for the app's core required configuration, plus explicit
 * dev/staging/production separation.
 *
 * Two access patterns, deliberately:
 * - `getEnv()` — the CORE config schema below (DATABASE_URL, JWT/encryption
 *   secrets, etc.): validated together, memoized, safe to call as often as
 *   needed from application code. Lazy (validates on first call, not at
 *   module load), so importing a module that calls this doesn't require
 *   every env var to already be set — the same test-friendliness the
 *   codebase's existing per-file `requireEnv` patterns had, just
 *   centralized.
 * - `requireEnv(name)` / `getStringEnv(name, default)` / `getNumberEnv(name,
 *   default)` — for everything else (feature-specific keys like
 *   ANTHROPIC_API_KEY/SMTP_*, and non-secret config-with-a-default like
 *   CART_TTL_MINUTES). Not part of the core schema because these are only
 *   required if the feature that uses them is actually exercised, not
 *   required for the process to boot at all.
 */

export type AppEnvironment = "development" | "staging" | "production" | "test";

const HEX_32_BYTES = /^[0-9a-f]{64}$/i;

/**
 * Exact placeholder strings from .env.example — if any of these are still
 * set when NODE_ENV=production, that's a real secret never having been
 * generated, not a valid production configuration. Checked in
 * KNOWN_PLACEHOLDER_VALUES() rather than the .env.example file directly,
 * since that file may not exist at all in a real deployment.
 */
const KNOWN_PLACEHOLDER_VALUES = new Set([
  "replace-with-a-random-256-bit-secret",
  "replace-with-a-different-random-256-bit-secret",
  "replace-with-a-random-32-byte-hex-value",
  "replace-with-a-strong-password",
]);

const coreEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "staging", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),

    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    FRONTEND_URL: z.string().min(1, "FRONTEND_URL is required"),

    JWT_ACCESS_SECRET: z.string().min(1, "JWT_ACCESS_SECRET is required"),
    JWT_ACCESS_TTL: z.string().min(1, "JWT_ACCESS_TTL is required"),
    JWT_REFRESH_TTL: z.string().min(1, "JWT_REFRESH_TTL is required"),

    COMMERCE_ENCRYPTION_KEY: z.string().regex(HEX_32_BYTES, "COMMERCE_ENCRYPTION_KEY must be a 64-character hex string (32 bytes) — generate with `openssl rand -hex 32`"),
    // Sprint 07.7-era key-rotation support (Phase 3 addition): when set,
    // decryptSecret() also accepts ciphertext written under this older
    // key, so a key can be rotated without breaking already-encrypted
    // provider credentials. See docs/runbooks/secret-rotation.md.
    COMMERCE_ENCRYPTION_KEY_PREVIOUS: z
      .string()
      .regex(HEX_32_BYTES, "COMMERCE_ENCRYPTION_KEY_PREVIOUS must be a 64-character hex string (32 bytes)")
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== "production") return;
    const secretFields: Array<[string, string]> = [
      ["JWT_ACCESS_SECRET", value.JWT_ACCESS_SECRET],
      ["COMMERCE_ENCRYPTION_KEY", value.COMMERCE_ENCRYPTION_KEY],
    ];
    for (const [key, val] of secretFields) {
      if (KNOWN_PLACEHOLDER_VALUES.has(val)) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${key} is still set to the .env.example placeholder value — production requires a real, generated secret (never the example value).`,
        });
      }
    }
  });

export type CoreEnv = z.infer<typeof coreEnvSchema>;

let cachedCoreEnv: CoreEnv | undefined;

function parseCoreEnv(): CoreEnv {
  if (cachedCoreEnv) return cachedCoreEnv;
  const result = coreEnvSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cachedCoreEnv = result.data;
  return cachedCoreEnv;
}

/** The app's core, always-required configuration — validated together, memoized after first call. */
export function getEnv(): CoreEnv {
  return parseCoreEnv();
}

/**
 * Eager, aggregated startup validation — call exactly once, as early as
 * possible in the real process entrypoint (src/index.ts), never from a
 * module that tests or other modules import, so importing application
 * code never has an implicit "env vars must already be set" requirement.
 * Throws a single error listing every problem at once, rather than
 * failing on the first missing variable and requiring a second run to
 * discover the next one.
 */
export function assertStartupEnv(): void {
  parseCoreEnv();
}

/** Test-only: clears the memoized core config so a test can validate a fresh process.env state within the same test file. Never call from application code. */
export function __resetEnvCacheForTests(): void {
  cachedCoreEnv = undefined;
}

/**
 * Shared implementation of "read one specific, feature-scoped env var,
 * throw a clear error if missing" — replaces the five near-identical
 * local copies that existed before Phase 3 (lib/jwt.ts, lib/encryption.ts,
 * customer-jwt.ts's requireSecret, prisma/seed.ts, and
 * notifications/providers/email.provider.ts). Used for env vars that are
 * only required when the specific feature that reads them is actually
 * exercised (e.g. SMTP_* only matters when an email is actually sent),
 * not required for the process to boot at all — which is why these live
 * outside the core schema above.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  // Mirrors coreEnvSchema's superRefine guard for JWT_ACCESS_SECRET/
  // COMMERCE_ENCRYPTION_KEY, extended to every requireEnv-based secret
  // (ADMIN_PASSWORD, SMTP_PASSWORD, etc.) — those live outside the core
  // schema (they're only required when the specific feature that reads
  // them actually runs, e.g. prisma/seed.ts), but a placeholder value
  // slipping through in production is exactly as dangerous here: e.g.
  // ADMIN_PASSWORD left at .env.example's committed
  // "replace-with-a-strong-password" would seed a live Role.ADMIN
  // account with a publicly-known password the first time the seed
  // script runs against production.
  if (process.env.NODE_ENV === "production" && KNOWN_PLACEHOLDER_VALUES.has(value)) {
    throw new Error(`${name} is still set to the .env.example placeholder value — production requires a real, generated value (never the example value).`);
  }
  return value;
}

/** An optional string config value with a default — replaces the `process.env.X ?? "default"` pattern scattered across file-storage.ts, release-storage.ts, domain.service.ts, and others with one consistent helper. */
export function getStringEnv(name: string, defaultValue: string): string {
  const value = process.env[name];
  return value && value.length > 0 ? value : defaultValue;
}

/** An optional numeric config value with a default — replaces the `Number(process.env.X ?? default)` pattern scattered across cart/fulfillment/import/site/event modules. Throws on a genuinely non-numeric value rather than silently producing NaN. */
export function getNumberEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return defaultValue;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a number, got: "${raw}"`);
  }
  return parsed;
}

/** An optional string value with no default — returns undefined if unset, exactly like a bare `process.env.X` read, but centralizing the read so call sites don't reach into `process.env` directly. */
export function getOptionalEnv(name: string): string | undefined {
  return process.env[name];
}

/** An optional boolean feature-flag with a default. Deliberately strict: only the exact string "true" is truthy; anything else (including "1", "yes", or a typo) is false, so a flag is never accidentally enabled. Non-core (not part of the boot-critical schema), so it can never block process start. */
export function getBooleanEnv(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return defaultValue;
  return raw === "true";
}

/**
 * BOS Phase 0 (P0) feature flag. When enabled, the Tenant Context resolver
 * attaches `req.tenant` to authenticated requests. Default OFF and, in
 * PR-P0.1, not yet consumed anywhere — the resolver is unwired. The wiring
 * (PR-P0.2) reads this flag; introducing the accessor here keeps the flag
 * definition alongside the rest of the app's config from the start. See
 * P0_EXECUTION_SPEC.md.
 */
export function isTenantContextEnabled(): boolean {
  return getBooleanEnv("TENANT_CONTEXT_ENABLED", false);
}

/**
 * Every environment variable this application reads anywhere, for the
 * safe startup summary below. Keeping this list here (rather than scanning
 * process.env dynamically) means an accidental future call site added
 * outside this module is still visible in `getSafeEnvSummary()`'s output
 * as soon as it's added to this list — a deliberate, explicit inventory,
 * not an automatic one.
 */
const KNOWN_ENV_KEYS = [
  "NODE_ENV",
  "PORT",
  "DATABASE_URL",
  "FRONTEND_URL",
  "JWT_ACCESS_SECRET",
  "JWT_ACCESS_TTL",
  "JWT_REFRESH_TTL",
  "JWT_REFRESH_SECRET", // documented in .env.example; not currently read by any module — see Phase 3 completion report
  "COMMERCE_ENCRYPTION_KEY",
  "COMMERCE_ENCRYPTION_KEY_PREVIOUS",
  // Multi-provider AI abstraction (lib/ai) — priority order OpenAI, then
  // Anthropic, then Gemini: the first of these three keys found set
  // selects the provider used for every AI feature (menu import, brand
  // analysis, content generation, the Brand Consistency judge). The
  // *_MODEL overrides are optional; each provider has a sensible default.
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_MODEL",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "GOOGLE_MAPS_API_KEY",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
  "ADMIN_NAME",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "SMTP_FROM_ADDRESS",
  "IMPORT_UPLOAD_DIR",
  "IMPORT_MAX_FILE_SIZE_BYTES",
  "IMPORT_WEBSITE_MAX_IMAGES",
  "SITE_RELEASE_DIR",
  "SITE_MAX_ASSET_SIZE_BYTES",
  "SITE_PLATFORM_DOMAIN",
  "CART_TTL_MINUTES",
  "DRIVER_OFFER_TIMEOUT_MS",
  "DRIVER_OFFER_SWEEP_INTERVAL_MS",
  "OUTBOX_POLL_INTERVAL_MS",
  "SSL_ISSUANCE_SWEEP_INTERVAL_MS",
  // §Job Durability (Phase 1) — all optional with in-code defaults
  // (lib/job-durability.ts / lib/job-reaper.ts): heartbeat cadence, the
  // staleness threshold, the reaper poll interval, the auto-retry cap, and
  // an on/off flag for the reaper.
  "JOB_HEARTBEAT_INTERVAL_MS",
  "JOB_STALE_AFTER_MS",
  "JOB_REAPER_INTERVAL_MS",
  "JOB_MAX_ATTEMPTS",
  "JOB_REAPER_ENABLED",
  // Production Hardening Phase 5 — deliberately outside the core schema:
  // Redis is an optional accelerator (distributed rate-limit store), not a
  // boot requirement. Unset means every rate limiter runs in-process only
  // (single-instance behavior, same as before this phase); see
  // lib/redis.ts and lib/redis-rate-limit-store.ts for the fail-open
  // contract this implies.
  "REDIS_URL",
  // Production Hardening Phase 7 — deliberately outside the core schema:
  // object storage is optional. OBJECT_STORAGE_BUCKET unset means
  // fileStorage/releaseStorage both stay on local disk, identical to
  // pre-Phase-7 behavior; see docs/runbooks/object-storage.md.
  "OBJECT_STORAGE_BUCKET",
  "OBJECT_STORAGE_REGION",
  "OBJECT_STORAGE_ENDPOINT",
  "OBJECT_STORAGE_ACCESS_KEY_ID",
  "OBJECT_STORAGE_SECRET_ACCESS_KEY",
  "OBJECT_STORAGE_PUBLIC_URL_BASE",
  // §M — deliberately outside the core schema: defaults to "false"/unset,
  // meaning every temporary storefront URL uses the /store/<slug> fallback
  // until this is explicitly flipped once *.SITE_PLATFORM_DOMAIN's wildcard
  // DNS is actually activated — see site.service.ts's temporaryStorefrontUrl
  // and docs/runbooks/wildcard-subdomains.md.
  "SITE_WILDCARD_DNS_ACTIVE",
  // Production Hardening Phase 9 — deliberately outside the core schema:
  // both are optional. LOG_LEVEL unset defaults to "info" (lib/logger.ts);
  // SENTRY_DSN unset means error tracking no-ops (lib/error-tracker.ts) —
  // logging already captures every error either way, so an unconfigured
  // Sentry is a reduced-observability default, never a boot requirement.
  "LOG_LEVEL",
  "SENTRY_DSN",
  // Production Hardening Phase 11 — deliberately outside the core schema:
  // every rate limiter already has a sensible hardcoded default
  // (middleware/rate-limit.ts); these only matter if an operator wants to
  // override one based on real load-test/production data (master spec
  // Phase 11 work item 5), never required to boot.
  "RATE_LIMIT_AUTH_PER_MINUTE",
  "RATE_LIMIT_IMPORT_PER_MINUTE",
  "RATE_LIMIT_SITE_GENERATION_PER_MINUTE",
  "RATE_LIMIT_CONTACT_FORM_PER_MINUTE",
  "RATE_LIMIT_CUSTOMER_AUTH_PER_MINUTE",
  "RATE_LIMIT_CHECKOUT_PER_MINUTE",
  "RATE_LIMIT_PUBLIC_COMMERCE_PER_MINUTE",
  "RATE_LIMIT_WEBHOOK_PER_MINUTE",
  "RATE_LIMIT_STAFF_ACTION_PER_MINUTE",
] as const;

/**
 * Startup diagnostics that are actually safe to log: which known
 * configuration keys are present, never their values. Use this — never
 * `console.log(process.env)` or `console.log(getEnv())` — for any startup
 * or debug logging that touches configuration (Phase 3: "no secret values
 * can appear in logs").
 */
export function getSafeEnvSummary(): Record<(typeof KNOWN_ENV_KEYS)[number], "set" | "unset"> {
  const summary = {} as Record<(typeof KNOWN_ENV_KEYS)[number], "set" | "unset">;
  for (const key of KNOWN_ENV_KEYS) {
    summary[key] = process.env[key] ? "set" : "unset";
  }
  return summary;
}
