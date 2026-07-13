/**
 * One-time backfill: `resolveSiteUrl` now refuses to return a verified
 * Domain row whose hostname matches a known-bad placeholder value (see
 * site.service.ts's `isKnownBadHost`), but any such row already sitting in
 * the database with `isPrimary: true, verificationStatus: "VERIFIED"` was
 * inserted before that safeguard existed and needs to actually be corrected
 * at the data layer too — not just bypassed at read time — so the domain
 * management screen stops showing it as a legitimate verified domain.
 *
 * This script finds every Domain row whose hostname contains one of those
 * known-bad fragments and demotes it: clears `isPrimary` and resets
 * `verificationStatus` back to `PENDING`, so it falls out of the
 * `resolveSiteUrl` verified-domain lookup entirely and the owner sees it in
 * their domain list as needing re-verification (rather than silently
 * disappearing).
 *
 * Idempotent and safe to re-run: only touches rows that still match the
 * blocklist; running it twice updates zero rows the second time.
 *
 * Usage: pnpm --filter api exec tsx scripts/normalize-bad-domain-records.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const KNOWN_BAD_DOMAIN_FRAGMENTS = ["placeholder.example", "sites.ordervora.example", ".vercel.app", ".onrender.com"];

async function main() {
  const candidates = await prisma.domain.findMany({
    where: { OR: KNOWN_BAD_DOMAIN_FRAGMENTS.map((fragment) => ({ hostname: { contains: fragment, mode: "insensitive" as const } })) },
  });

  if (candidates.length === 0) {
    console.log("No bad domain records found — nothing to normalize.");
    return;
  }

  for (const domain of candidates) {
    await prisma.domain.update({
      where: { id: domain.id },
      data: { isPrimary: false, verificationStatus: "PENDING" },
    });
    console.log(`Demoted Domain ${domain.id} (${domain.hostname}) — no longer primary/verified.`);
  }

  console.log(`Normalized ${candidates.length} bad domain record(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
