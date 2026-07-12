import "dotenv/config";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { prisma } from "../src/lib/prisma";

/**
 * A hosting platform's pre-deploy hook (e.g. Render's `preDeployCommand`)
 * runs on every deploy, not just the first — but `prisma/seed-beta.ts`
 * itself isn't safe to re-run unconditionally (most of its rows have no
 * upsert-by-name guard and would duplicate). This wrapper makes chaining
 * it into a pre-deploy hook safe: it only invokes the real seed once,
 * the first time the database is empty, and is a no-op on every deploy
 * after that.
 */
async function main() {
  const existing = await prisma.restaurant.count();
  if (existing > 0) {
    console.log(`seed-if-empty: ${existing} restaurant(s) already present, skipping beta seed.`);
    return;
  }

  console.log("seed-if-empty: database is empty, running beta seed...");
  execFileSync(process.execPath, [path.join(__dirname, "../prisma/seed-beta.js")], { stdio: "inherit" });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
