import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    site: { findUnique: vi.fn() },
    contactMessage: { create: vi.fn(), findMany: vi.fn() },
  },
}));

import { prisma } from "../../lib/prisma";
import { listContactMessages, submitContactMessage } from "./contact.service";
import { SiteNotFoundError } from "./site.errors";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1" } as never);
});

describe("submitContactMessage", () => {
  it("throws SiteNotFoundError for a site that doesn't exist", async () => {
    mockPrisma.site.findUnique.mockResolvedValue(null);
    await expect(submitContactMessage("missing-site", "203.0.113.7", { name: "Jane", email: "jane@example.com", message: "Hi!" })).rejects.toBeInstanceOf(
      SiteNotFoundError,
    );
  });

  it("stores a hashed IP, never the raw one", async () => {
    mockPrisma.contactMessage.create.mockResolvedValue({} as never);

    await submitContactMessage("site-1", "203.0.113.7", { name: "Jane", email: "jane@example.com", message: "Hi!" });

    const data = mockPrisma.contactMessage.create.mock.calls[0][0].data;
    expect(data.ipHash).not.toContain("203.0.113.7");
    expect(data.ipHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("silently drops (without persisting) a submission with a filled-in honeypot", async () => {
    const result = await submitContactMessage("site-1", "203.0.113.7", {
      name: "Bot",
      email: "bot@example.com",
      message: "spam",
      honeypot: "filled-in",
    });

    expect(result.submitted).toBe(true); // doesn't tip off the bot
    expect(mockPrisma.contactMessage.create).not.toHaveBeenCalled();
  });

  it("produces the same hash for the same IP (so repeat-offender rate limiting could key off it)", async () => {
    mockPrisma.contactMessage.create.mockResolvedValue({} as never);

    await submitContactMessage("site-1", "203.0.113.7", { name: "A", email: "a@example.com", message: "1" });
    await submitContactMessage("site-1", "203.0.113.7", { name: "B", email: "b@example.com", message: "2" });

    const [first, second] = mockPrisma.contactMessage.create.mock.calls.map((call) => call[0].data.ipHash);
    expect(first).toBe(second);
  });
});

describe("listContactMessages", () => {
  it("throws SiteNotFoundError for a site owned by a different restaurant", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", restaurantId: "someone-else" } as never);
    await expect(listContactMessages("restaurant-1", "site-1")).rejects.toBeInstanceOf(SiteNotFoundError);
  });

  it("lists messages newest first", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", restaurantId: "restaurant-1" } as never);
    mockPrisma.contactMessage.findMany.mockResolvedValue([] as never);

    await listContactMessages("restaurant-1", "site-1");

    expect(mockPrisma.contactMessage.findMany).toHaveBeenCalledWith({ where: { siteId: "site-1" }, orderBy: { createdAt: "desc" } });
  });
});
