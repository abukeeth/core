import { resolveCname, resolveTxt } from "node:dns/promises";
import type { Domain, DomainEvent, DomainEventType } from "@prisma/client";
import { getStringEnv } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { DomainAlreadyClaimedError, DomainNotFoundError, InvalidDomainError } from "./site.errors";
import { getOwnSiteById } from "./site.service";

const PLATFORM_DOMAIN = getStringEnv("SITE_PLATFORM_DOMAIN", "sites.ordervora.example");
const EXPECTED_CNAME_TARGET = `edge.${PLATFORM_DOMAIN}`;
// A cert issued today is modeled as valid for 90 days, matching Let's
// Encrypt's real-world validity window — see ssl-issuance-scheduler.ts for
// the renewal sweep that flips ACTIVE -> EXPIRED once this passes.
const TLS_VALIDITY_DAYS = 90;

export interface DnsRecordInstruction {
  type: "CNAME" | "TXT";
  name: string;
  value: string;
}

/** The TXT record name the owner must publish to prove control of `hostname` — a sibling of the domain, not the domain itself, so it never collides with the owner's own DNS records. */
export function challengeRecordName(hostname: string): string {
  return `_ordervora-challenge.${hostname}`;
}

/** The exact records the Connect Domain wizard shows the owner (§ Step 3 — Generate DNS Records). */
export function dnsRecordsFor(hostname: string, verificationToken: string): DnsRecordInstruction[] {
  return [
    { type: "CNAME", name: hostname, value: EXPECTED_CNAME_TARGET },
    { type: "TXT", name: challengeRecordName(hostname), value: verificationToken },
  ];
}

export interface DnsCheckResult {
  cnameOk: boolean;
  txtOk: boolean;
}

/**
 * Real DNS verification (§20, extended Sprint 20A Task 4): the CNAME check
 * alone only proves *some* DNS record points at our edge — it can't tell
 * two different tenants' claims on the same intent apart, and doesn't
 * prove the caller actually controls the domain's DNS (someone could add a
 * CNAME for a subdomain they don't otherwise control if a registrar allowed
 * it). The TXT challenge record is the actual proof-of-control: only
 * whoever can edit DNS for `hostname` can publish the exact per-domain
 * token we handed them at addDomain time. Both real DNS lookups run here
 * and are unit-testable via mocking node:dns/promises.
 *
 * TLS issuance via a real ACME/Let's Encrypt client is NOT implemented —
 * this sandbox has no publicly reachable edge server for Let's Encrypt's
 * HTTP-01/DNS-01 challenge to reach, so there is no way to make a genuine
 * CA handshake succeed here. See ssl-issuance-scheduler.ts for how the
 * rest of the SSL state machine (PENDING -> GENERATING -> ACTIVE ->
 * EXPIRED/FAILED) is real, persisted, and swept — only the actual
 * "call out to a Certificate Authority" step is a documented stub.
 */
export async function checkDomainDns(hostname: string, verificationToken: string): Promise<DnsCheckResult> {
  const [cnameOk, txtOk] = await Promise.all([checkCname(hostname), checkTxt(hostname, verificationToken)]);
  return { cnameOk, txtOk };
}

async function checkCname(hostname: string): Promise<boolean> {
  try {
    const records = await resolveCname(hostname);
    return records.some((record) => record.toLowerCase() === EXPECTED_CNAME_TARGET.toLowerCase());
  } catch {
    return false;
  }
}

async function checkTxt(hostname: string, token: string): Promise<boolean> {
  try {
    const records = await resolveTxt(challengeRecordName(hostname));
    return records.some((chunks) => chunks.join("").trim() === token);
  } catch {
    return false;
  }
}

/** Back-compat export for the pre-Task-4 CNAME-only check some earlier code paths may still reference. */
export async function checkDnsOwnership(hostname: string): Promise<boolean> {
  return checkCname(hostname);
}

function assertNotPlatformDomain(hostname: string): void {
  const lower = hostname.toLowerCase();
  const platform = PLATFORM_DOMAIN.toLowerCase();
  if (lower === platform || lower.endsWith(`.${platform}`)) {
    throw new InvalidDomainError(`${hostname} is a reserved OrderVora domain and can't be connected as a custom domain.`);
  }
}

async function logDomainEvent(
  siteId: string,
  domainId: string | null,
  hostname: string,
  type: DomainEventType,
  message?: string,
): Promise<void> {
  await prisma.domainEvent.create({ data: { siteId, domainId, hostname, type, message } });
}

export async function addDomain(restaurantId: string, siteId: string, hostname: string): Promise<Domain> {
  const site = await getOwnSiteById(restaurantId, siteId);
  assertNotPlatformDomain(hostname);
  const existing = await prisma.domain.findUnique({ where: { hostname } });
  if (existing) {
    throw new DomainAlreadyClaimedError();
  }
  const domain = await prisma.domain.create({
    data: { siteId: site.id, hostname, type: "CUSTOM", verificationStatus: "PENDING", tlsStatus: "PENDING" },
  });
  await logDomainEvent(site.id, domain.id, domain.hostname, "CREATED", "Domain connected — add the DNS records below, then verify.");
  return domain;
}

export async function listDomains(restaurantId: string, siteId: string): Promise<Domain[]> {
  const site = await getOwnSiteById(restaurantId, siteId);
  return prisma.domain.findMany({ where: { siteId: site.id }, orderBy: { createdAt: "asc" } });
}

export async function listDomainHistory(restaurantId: string, siteId: string): Promise<DomainEvent[]> {
  const site = await getOwnSiteById(restaurantId, siteId);
  return prisma.domainEvent.findMany({ where: { siteId: site.id }, orderBy: { createdAt: "desc" } });
}

async function findOwnDomain(siteId: string, domainId: string): Promise<Domain> {
  const domain = await prisma.domain.findUnique({ where: { id: domainId } });
  if (!domain || domain.siteId !== siteId) {
    throw new DomainNotFoundError();
  }
  return domain;
}

function describeDnsFailure(cnameOk: boolean, txtOk: boolean): string {
  if (!cnameOk && !txtOk) return "Missing both the CNAME and TXT verification records — add both, then check again.";
  if (!cnameOk) return "The CNAME record is missing or doesn't point at the right target yet.";
  return "The TXT verification record is missing or doesn't match yet — DNS changes can take a few minutes to propagate.";
}

/**
 * Verification is a hard gate for BOTH records (see checkDomainDns) — a
 * pass immediately kicks off SSL issuance (tlsStatus -> GENERATING; the
 * sweep in ssl-issuance-scheduler.ts carries it the rest of the way). A
 * failure never touches tlsStatus and records a specific, actionable
 * reason via DomainEvent so the wizard can show real DNS troubleshooting
 * guidance instead of a bare "failed."
 */
export async function verifyDomain(restaurantId: string, siteId: string, domainId: string): Promise<Domain> {
  const site = await getOwnSiteById(restaurantId, siteId);
  const domain = await findOwnDomain(site.id, domainId);
  const { cnameOk, txtOk } = await checkDomainDns(domain.hostname, domain.verificationToken);
  const verified = cnameOk && txtOk;

  const updated = await prisma.domain.update({
    where: { id: domain.id },
    data: {
      verificationStatus: verified ? "VERIFIED" : "FAILED",
      lastCheckedAt: new Date(),
      ...(verified ? { tlsStatus: "GENERATING" } : {}),
    },
  });

  if (verified) {
    await logDomainEvent(site.id, domain.id, domain.hostname, "VERIFIED", "DNS verified.");
    await logDomainEvent(site.id, domain.id, domain.hostname, "SSL_GENERATING", "Certificate issuance started.");
  } else {
    await logDomainEvent(site.id, domain.id, domain.hostname, "VERIFICATION_FAILED", describeDnsFailure(cnameOk, txtOk));
  }

  return updated;
}

export async function setPrimaryDomain(restaurantId: string, siteId: string, domainId: string): Promise<Domain> {
  const site = await getOwnSiteById(restaurantId, siteId);
  const domain = await findOwnDomain(site.id, domainId);
  if (domain.verificationStatus !== "VERIFIED") {
    throw new DomainNotFoundError();
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.domain.updateMany({ where: { siteId: site.id }, data: { isPrimary: false } });
    return tx.domain.update({ where: { id: domain.id }, data: { isPrimary: true } });
  });

  await logDomainEvent(site.id, domain.id, domain.hostname, "PRIMARY_CHANGED", `${domain.hostname} is now the primary domain.`);
  return updated;
}

export async function removeDomain(restaurantId: string, siteId: string, domainId: string): Promise<void> {
  const site = await getOwnSiteById(restaurantId, siteId);
  const domain = await findOwnDomain(site.id, domainId);
  await logDomainEvent(site.id, domain.id, domain.hostname, "DISCONNECTED", `${domain.hostname} was disconnected.`);
  await prisma.domain.delete({ where: { id: domain.id } });
}

function tlsExpiryFromNow(): Date {
  return new Date(Date.now() + TLS_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
}

/** Stands in for a real ACME client call — see checkDomainDns's doc comment on why this sandbox can't make a genuine CA handshake. */
async function issueCertificate(hostname: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  void hostname;
  return { ok: true };
}

/**
 * Called by ssl-issuance-scheduler.ts's interval sweep. Two independent
 * passes: domains in GENERATING move to ACTIVE/FAILED via the
 * issueCertificate stub above, and domains in ACTIVE past their
 * tlsExpiresAt move to EXPIRED (a real renewal-window check, even though
 * the certificate itself is simulated).
 */
export async function runSslIssuanceSweep(): Promise<{ processedCount: number }> {
  const generating = await prisma.domain.findMany({ where: { tlsStatus: "GENERATING" } });
  let processedCount = 0;

  for (const domain of generating) {
    const result = await issueCertificate(domain.hostname);
    if (result.ok) {
      await prisma.domain.update({ where: { id: domain.id }, data: { tlsStatus: "ACTIVE", tlsExpiresAt: tlsExpiryFromNow() } });
      await logDomainEvent(domain.siteId, domain.id, domain.hostname, "SSL_ACTIVE", "Certificate issued.");
    } else {
      await prisma.domain.update({ where: { id: domain.id }, data: { tlsStatus: "FAILED" } });
      await logDomainEvent(domain.siteId, domain.id, domain.hostname, "SSL_FAILED", result.reason);
    }
    processedCount += 1;
  }

  const expired = await prisma.domain.updateMany({
    where: { tlsStatus: "ACTIVE", tlsExpiresAt: { lt: new Date() } },
    data: { tlsStatus: "EXPIRED" },
  });
  processedCount += expired.count;

  return { processedCount };
}
