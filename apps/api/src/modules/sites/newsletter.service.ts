import type { NewsletterSubscriber } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { SiteNotFoundError } from "./site.errors";
import { getOwnSiteById } from "./site.service";

export interface NewsletterSubscribeInput {
  email: string;
  /** Honeypot field — real users never fill it in; bots that do get silently accepted-but-dropped. */
  honeypot?: string;
}

/**
 * POST /public/sites/:id/newsletter (Sprint 20A Task 5; unauthenticated,
 * rate-limited at the route layer, same as contact.service.ts's
 * submitContactMessage). Upsert-on-conflict rather than erroring on a
 * repeat signup — resubmitting the same address is a normal thing to
 * happen (revisiting the page, submitting from both the Newsletter
 * section and the footer's inline form) and should stay a no-op, not a
 * customer-visible failure.
 */
export async function subscribeToNewsletter(siteId: string, input: NewsletterSubscribeInput): Promise<{ subscribed: boolean }> {
  if (input.honeypot) {
    return { subscribed: true };
  }

  const site = await prisma.site.findUnique({ where: { id: siteId }, select: { id: true } });
  if (!site) {
    throw new SiteNotFoundError();
  }

  await prisma.newsletterSubscriber.upsert({
    where: { siteId_email: { siteId, email: input.email } },
    create: { siteId, email: input.email },
    update: {},
  });

  return { subscribed: true };
}

export async function listNewsletterSubscribers(restaurantId: string, siteId: string): Promise<NewsletterSubscriber[]> {
  const site = await getOwnSiteById(restaurantId, siteId);
  return prisma.newsletterSubscriber.findMany({ where: { siteId: site.id }, orderBy: { createdAt: "desc" } });
}
