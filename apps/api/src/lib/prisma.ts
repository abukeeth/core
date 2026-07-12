import type { PoolConfig } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { getStringEnv } from "../config/env";

/**
 * Built from the parsed URL's discrete fields (host/port/user/password/
 * database) rather than passed as `{ connectionString }` directly: `pg`'s
 * ConnectionParameters constructor re-parses `connectionString` and merges
 * it *over* any explicit sibling fields (including `ssl`), so an explicit
 * `ssl` override is silently discarded whenever `connectionString` is also
 * present in the same config object. Parsing here instead means our `ssl`
 * choice — encrypted, not certificate-verified, matching Supabase's own
 * guidance for its Supavisor pooler — is authoritative regardless of
 * whether a `sslmode`/`uselibpqcompat` query param is present, absent, or
 * mistyped in the deployed `DATABASE_URL` value.
 */
function poolConfigFromUrl(connectionString: string): PoolConfig {
  if (!connectionString) return {};
  const url = new URL(connectionString);
  const sslMode = url.searchParams.get("sslmode");
  const config: PoolConfig = {
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
  };
  if (sslMode && sslMode !== "disable") {
    config.ssl = { rejectUnauthorized: false };
  }
  return config;
}

// Deliberately the narrow, non-throwing getStringEnv here, not getEnv()'s
// full validated core schema: this module is imported (transitively, via
// service modules) by several test files that never touch a real
// database and don't mock this module out, so it must not throw at
// import time just because the rest of the app's config isn't set up in
// that test's process. The real enforcement point for "DATABASE_URL must
// actually be a valid connection string" is assertStartupEnv(), called
// once in src/index.ts before the server ever starts accepting requests.
const adapter = new PrismaPg(poolConfigFromUrl(getStringEnv("DATABASE_URL", "")));

export const prisma = new PrismaClient({ adapter });
