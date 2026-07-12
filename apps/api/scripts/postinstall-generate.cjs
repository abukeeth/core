"use strict";

const { execSync } = require("node:child_process");

// pnpm's workspace install runs every package's postinstall, not just the
// one actually being built — so deploying apps/web (which never touches
// apps/api's Prisma client) still triggers this script during its own
// `pnpm install`, in an environment that has no reason to carry
// DATABASE_URL. `prisma generate` needs it resolvable (via
// prisma.config.ts's env("DATABASE_URL")) even just to run, so skip
// gracefully instead of failing the whole install. apps/api's own
// build/deploy always has DATABASE_URL set and generates normally.
if (!process.env.DATABASE_URL) {
  console.log(
    "postinstall-generate: DATABASE_URL not set, skipping `prisma generate` " +
      "(expected when another workspace package's install triggers this).",
  );
  process.exit(0);
}

execSync("prisma generate", { stdio: "inherit" });
