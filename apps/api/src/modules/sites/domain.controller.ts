import type { Domain } from "@prisma/client";
import type { Request, Response } from "express";
import { mapSiteError, paramId, requireOwnRestaurantId } from "./controller-helpers";
import { addDomain, dnsRecordsFor, listDomainHistory, listDomains, removeDomain, setPrimaryDomain, verifyDomain } from "./domain.service";
import { addDomainSchema } from "./site.validation";

function withDnsRecords(domain: Domain) {
  return { ...domain, dnsRecords: dnsRecordsFor(domain.hostname, domain.verificationToken) };
}

export async function add(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = addDomainSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const domain = await addDomain(restaurantId, paramId(req), parsed.data.hostname);
    res.status(201).json({ domain: withDnsRecords(domain) });
  } catch (err) {
    if (!mapSiteError(err, res)) throw err;
  }
}

export async function list(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    const domains = await listDomains(restaurantId, paramId(req));
    res.status(200).json({ domains: domains.map(withDnsRecords) });
  } catch (err) {
    if (!mapSiteError(err, res)) throw err;
  }
}

/** GET /api/sites/:id/domain-history — full lifecycle timeline (§ Step 7), survives individual domains being disconnected. */
export async function history(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    const events = await listDomainHistory(restaurantId, paramId(req));
    res.status(200).json({ events });
  } catch (err) {
    if (!mapSiteError(err, res)) throw err;
  }
}

export async function verify(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    const domain = await verifyDomain(restaurantId, paramId(req), paramId(req, "did"));
    res.status(200).json({ domain: withDnsRecords(domain) });
  } catch (err) {
    if (!mapSiteError(err, res)) throw err;
  }
}

export async function setPrimary(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    const domain = await setPrimaryDomain(restaurantId, paramId(req), paramId(req, "did"));
    res.status(200).json({ domain: withDnsRecords(domain) });
  } catch (err) {
    if (!mapSiteError(err, res)) throw err;
  }
}

export async function remove(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    await removeDomain(restaurantId, paramId(req), paramId(req, "did"));
    res.status(204).send();
  } catch (err) {
    if (!mapSiteError(err, res)) throw err;
  }
}
