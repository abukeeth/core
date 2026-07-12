import { createHash } from "node:crypto";
import type { ContactMessage } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { SiteNotFoundError } from "./site.errors";
import { getOwnSiteById } from "./site.service";

export interface ContactMessageInput {
  name: string;
  email: string;
  message: string;
  /** Honeypot field — real users never fill it in; bots that do get silently accepted-but-dropped. */
  honeypot?: string;
}

/**
 * POST /public/sites/:id/contact (§7, §23; unauthenticated, rate-limited
 * at the route layer — see contact.routes wiring). Only the IP hash is
 * stored, never the raw IP (§27). Messages land in the dashboard inbox
 * (ContactMessage table, fully implemented); emailing the owner is NOT
 * implemented since there's no live email provider configured in this
 * environment — see Known Limitations.
 */
export async function submitContactMessage(
  siteId: string,
  ip: string,
  input: ContactMessageInput,
): Promise<{ submitted: boolean }> {
  if (input.honeypot) {
    return { submitted: true };
  }

  const site = await prisma.site.findUnique({ where: { id: siteId }, select: { id: true } });
  if (!site) {
    throw new SiteNotFoundError();
  }

  const ipHash = createHash("sha256").update(ip).digest("hex");
  await prisma.contactMessage.create({
    data: { siteId, name: input.name, email: input.email, message: input.message, ipHash },
  });

  return { submitted: true };
}

export async function listContactMessages(restaurantId: string, siteId: string): Promise<ContactMessage[]> {
  const site = await getOwnSiteById(restaurantId, siteId);
  return prisma.contactMessage.findMany({ where: { siteId: site.id }, orderBy: { createdAt: "desc" } });
}
