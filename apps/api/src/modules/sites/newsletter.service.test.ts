import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    site: { findUnique: vi.fn() },
    newsletterSubscriber: { upsert: vi.fn(), findMany: vi.fn() },
  },
}));

import { prisma } from "../../lib/prisma";
import { listNewsletterSubscribers, subscribeToNewsletter } from "./newsletter.service";
import { SiteNotFoundError } from "./site.errors";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1" } as never);
});

describe("subscribeToNewsletter", () => {
  it("throws SiteNotFoundError for a site that doesn't exist", async () => {
    mockPrisma.site.findUnique.mockResolvedValue(null);
    await expect(subscribeToNewsletter("missing-site", { email: "jane@example.com" })).rejects.toBeInstanceOf(SiteNotFoundError);
  });

  it("upserts on [siteId, email] so a repeat signup is a harmless no-op, not a duplicate or an error", async () => {
    mockPrisma.newsletterSubscriber.upsert.mockResolvedValue({} as never);

    await subscribeToNewsletter("site-1", { email: "jane@example.com" });

    expect(mockPrisma.newsletterSubscriber.upsert).toHaveBeenCalledWith({
      where: { siteId_email: { siteId: "site-1", email: "jane@example.com" } },
      create: { siteId: "site-1", email: "jane@example.com" },
      update: {},
    });
  });

  it("silently drops (without persisting) a submission with a filled-in honeypot", async () => {
    const result = await subscribeToNewsletter("site-1", { email: "bot@example.com", honeypot: "filled-in" });

    expect(result.subscribed).toBe(true); // doesn't tip off the bot
    expect(mockPrisma.newsletterSubscriber.upsert).not.toHaveBeenCalled();
  });
});

describe("listNewsletterSubscribers", () => {
  it("throws SiteNotFoundError for a site owned by a different restaurant", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", restaurantId: "someone-else" } as never);
    await expect(listNewsletterSubscribers("restaurant-1", "site-1")).rejects.toBeInstanceOf(SiteNotFoundError);
  });

  it("lists subscribers newest first", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", restaurantId: "restaurant-1" } as never);
    mockPrisma.newsletterSubscriber.findMany.mockResolvedValue([] as never);

    await listNewsletterSubscribers("restaurant-1", "site-1");

    expect(mockPrisma.newsletterSubscriber.findMany).toHaveBeenCalledWith({ where: { siteId: "site-1" }, orderBy: { createdAt: "desc" } });
  });
});
