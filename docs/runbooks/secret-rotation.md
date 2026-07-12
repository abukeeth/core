# Secret Rotation

Part of Production Hardening Phase 3 (`PRODUCTION_HARDENING_MASTER_SPEC.md`). Every secret this application uses, how to rotate it, and what breaks (or doesn't) while you do.

All secrets are read through `apps/api/src/config/env.ts` — see `docs/runbooks/environment-configuration.md` for the full inventory and validation rules. This document covers only the *rotation procedure* for each one.

## `COMMERCE_ENCRYPTION_KEY` (BYOP provider credential encryption)

**What it protects:** every restaurant's own payment/fulfillment/POS provider credentials (`PaymentProvider.credentialsEncrypted`, `.webhookSecretEncrypted`, and the equivalent fields on `FulfillmentProvider`/`POSProvider`). If this key leaks, every connected restaurant's live merchant credentials leak with it.

**Rotation is safe and non-disruptive**, because `lib/encryption.ts`'s envelope format is versioned (Sprint 07.7-era design, extended in Phase 3):

- `encryptSecret()` always writes under the *current* key (`COMMERCE_ENCRYPTION_KEY`), tagging the envelope with key version `"1"`.
- `decryptSecret()` accepts ciphertext written under the current key (version `"1"`), the previous key (version `"2"`, via `COMMERCE_ENCRYPTION_KEY_PREVIOUS`), **and** the original pre-Phase-3 format with no version tag at all (always treated as the current key). Nothing already encrypted ever becomes unreadable just because a rotation happened.

**Procedure:**

1. Generate a new key: `openssl rand -hex 32`.
2. Set `COMMERCE_ENCRYPTION_KEY_PREVIOUS` to the *current* value of `COMMERCE_ENCRYPTION_KEY` (the one about to be replaced).
3. Set `COMMERCE_ENCRYPTION_KEY` to the newly generated key.
4. Deploy. From this point: new `encryptSecret()` calls use the new key; existing ciphertext (written under the old key, or in the legacy unversioned format) still decrypts correctly via `COMMERCE_ENCRYPTION_KEY_PREVIOUS`.
5. **Optional but recommended — migrate existing ciphertext onto the new key**, so `COMMERCE_ENCRYPTION_KEY_PREVIOUS` can eventually be removed: for every row with a `credentialsEncrypted`/`webhookSecretEncrypted` field, call `reencryptSecret(existingValue)` and write the result back. This is a straightforward, idempotent read-decrypt-encrypt-write pass — safe to run repeatedly, safe to run against a subset of rows at a time (e.g. in batches, off-hours), and safe to interrupt and resume (rows already migrated just get a fresh IV on a second pass, which is harmless).
6. Once every row has been migrated (confirm via a query — no remaining rows whose ciphertext, when inspected, uses key version `"2"` or the legacy 3-part format), remove `COMMERCE_ENCRYPTION_KEY_PREVIOUS` from the environment. The previous key is no longer referenced anywhere and can be safely discarded.

**If you skip step 5** (no migration), `COMMERCE_ENCRYPTION_KEY_PREVIOUS` simply needs to stay set indefinitely — there's no forced deadline, and nothing breaks either way.

**If you rotate again before finishing a previous migration:** don't overwrite `COMMERCE_ENCRYPTION_KEY_PREVIOUS` with the newest-previous key while an older-previous key still has un-migrated ciphertext depending on it — that ciphertext would become unreadable. Either finish migrating everything before rotating again, or extend `lib/encryption.ts` to support a small ordered list of previous keys rather than just one, if multiple rotations need to be in flight simultaneously (not needed today; noted here so it isn't a surprise later).

## `JWT_ACCESS_SECRET` (staff + customer access tokens)

**What it protects:** the signing key for both staff (`lib/jwt.ts`) and customer (`customer-jwt.ts`) short-lived access tokens.

**Rotation is disruptive today — not versioned.** Unlike the encryption key, there is currently only one active `JWT_ACCESS_SECRET` at a time, with no "previous key" fallback. Rotating it immediately invalidates **every** currently-issued access token, staff and customer alike, for every restaurant — the next request each of those sessions makes will fail signature verification and require a fresh login.

**Procedure:**

1. Generate a new secret: `openssl rand -hex 32`.
2. This must be a **planned, communicated rotation**, not an emergency one performed silently — every active user session ends the moment the new secret takes effect. Communicate the expected brief re-login requirement in advance if this is a routine rotation; if it's an emergency rotation (suspected key compromise), the disruption is the intended, correct outcome.
3. Set `JWT_ACCESS_SECRET` to the new value and deploy.
4. Refresh tokens are unaffected by this rotation (staff refresh tokens are already DB-tracked opaque tokens via the `RefreshToken` table, unrelated to this signing key; customer refresh tokens are likewise DB-tracked via `CustomerRefreshToken`, Sprint 07.7 H-7) — so a user who was already mid-session simply gets a new access token transparently on their next `/refresh` call, without needing to re-enter credentials, *provided* their refresh token is still valid. Only a still-valid access token that hasn't yet expired is invalidated outright.

**Future improvement, not implemented in Phase 3:** adding a key-version scheme to access tokens (mirroring the encryption key's design) would let a rotation take effect only for newly-issued tokens, with old tokens remaining valid until their natural (short) expiry — removing the "every session ends immediately" disruption. Flagged as a reasonable enhancement, out of scope for this phase.

## `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL`

Not secrets (duration strings, e.g. `"15m"`, `"30d"`), but configuration that affects session security posture. No rotation procedure needed — change the value and deploy; it only affects newly-issued tokens' expiry, nothing retroactive.

## `DATABASE_URL`

**What it protects:** database credentials. Rotation is a provider-level operation (create a new database user/password, update the connection string, deploy, then revoke the old credentials once confirmed working) — see `docs/runbooks/database-setup.md` for provisioning details. Not application-code-specific; standard credential rotation for whatever Postgres provider is in use.

## `ANTHROPIC_API_KEY` / `GOOGLE_MAPS_API_KEY`

Third-party API keys, not application secrets — rotate via each provider's own dashboard (Anthropic Console, Google Cloud Console), update the environment variable, deploy. No application-level coordination needed since these are read fresh on every call (`getOptionalEnv("ANTHROPIC_API_KEY")` / `getStringEnv("GOOGLE_MAPS_API_KEY", "")`), not cached.

## `SMTP_*` credentials

Standard SMTP provider credential rotation — update via the provider's dashboard, update the environment variables, deploy. No in-app caching to worry about (`email.provider.ts` calls `requireEnv()` fresh on every send).

## `ADMIN_PASSWORD`

Used only by `prisma db seed` to bootstrap the single platform ADMIN account — not read by the running application at all. "Rotating" this means changing the password on the actual `User` row in the database directly (the seed script only creates the row if it doesn't already exist; it does not reset an existing admin's password), through whatever the platform's own account-management flow is for staff — this env var only matters for the very first bootstrap.

## General principle: never rotate silently in an emergency

For any secret above, if a rotation is happening because of a suspected leak (not routine hygiene), also: check the affected credential's own audit log/access history if the provider offers one (Stripe, Anthropic, the database provider, etc.), and treat the rotation as one part of an incident response, not the whole response.
