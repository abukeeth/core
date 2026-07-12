import "dotenv/config";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { Role } from "@prisma/client";
import { prisma } from "../src/lib/prisma";

/**
 * A hosting platform's pre-deploy hook (e.g. Render's `preDeployCommand`)
 * runs on every deploy, not just the first. This wrapper makes chaining
 * the production bootstrap (`prisma/seed.ts`, which creates the single
 * ADMIN_EMAIL-based platform admin — see render.yaml) into a pre-deploy
 * hook safe: it only invokes it once, the first time no ADMIN user
 * exists, and is a no-op on every deploy after that.
 */
async function main() {
  const existingAdmins = await prisma.user.count({ where: { role: Role.ADMIN } });
  if (existingAdmins > 0) {
    console.log(`seed-if-empty: ${existingAdmins} ADMIN user(s) already present, skipping bootstrap seed.`);
    return;
  }

  console.log("seed-if-empty: no ADMIN user found, running production bootstrap seed...");
  execFileSync(process.execPath, [path.join(__dirname, "../prisma/seed.js")], { stdio: "inherit" });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
