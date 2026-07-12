import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockResolveCname, mockResolveTxt } = vi.hoisted(() => ({ mockResolveCname: vi.fn(), mockResolveTxt: vi.fn() }));

vi.mock("node:dns/promises", () => ({ resolveCname: mockResolveCname, resolveTxt: mockResolveTxt }));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    site: { findUnique: vi.fn() },
    domain: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn() },
    domainEvent: { create: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "../../lib/prisma";
import {
  addDomain,
  checkDnsOwnership,
  checkDomainDns,
  challengeRecordName,
  dnsRecordsFor,
  listDomainHistory,
  removeDomain,
  runSslIssuanceSweep,
  setPrimaryDomain,
  verifyDomain,
} from "./domain.service";
import { DomainAlreadyClaimedError, DomainNotFoundError, InvalidDomainError } from "./site.errors";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma));
  mockPrisma.domainEvent.create.mockResolvedValue({} as never);
});

describe("dnsRecordsFor / challengeRecordName", () => {
  it("returns a CNAME pointing at the platform edge and a TXT challenge record carrying the token", () => {
    const records = dnsRecordsFor("menu.example.com", "secret-token");
    expect(records).toEqual([
      { type: "CNAME", name: "menu.example.com", value: "edge.sites.ordervora.example" },
      { type: "TXT", name: "_ordervora-challenge.menu.example.com", value: "secret-token" },
    ]);
  });

  it("names the TXT challenge record as a sibling of the domain, not the domain itself", () => {
    expect(challengeRecordName("menu.example.com")).toBe("_ordervora-challenge.menu.example.com");
  });
});

describe("checkDnsOwnership (legacy CNAME-only check)", () => {
  it("returns true when the CNAME points at our edge target", async () => {
    mockResolveCname.mockResolvedValue(["edge.sites.ordervora.example"]);
    expect(await checkDnsOwnership("menu.example.com")).toBe(true);
  });

  it("returns false when the CNAME points elsewhere", async () => {
    mockResolveCname.mockResolvedValue(["somewhere-else.example.com"]);
    expect(await checkDnsOwnership("menu.example.com")).toBe(false);
  });

  it("returns false (not throw) when DNS resolution fails", async () => {
    mockResolveCname.mockRejectedValue(new Error("NXDOMAIN"));
    await expect(checkDnsOwnership("menu.example.com")).resolves.toBe(false);
  });
});

describe("checkDomainDns", () => {
  it("requires both the CNAME and the TXT ownership token to match", async () => {
    mockResolveCname.mockResolvedValue(["edge.sites.ordervora.example"]);
    mockResolveTxt.mockResolvedValue([["secret-token"]]);

    expect(await checkDomainDns("menu.example.com", "secret-token")).toEqual({ cnameOk: true, txtOk: true });
  });

  it("flags txtOk false when the TXT record doesn't match the assigned token", async () => {
    mockResolveCname.mockResolvedValue(["edge.sites.ordervora.example"]);
    mockResolveTxt.mockResolvedValue([["someone-elses-token"]]);

    expect(await checkDomainDns("menu.example.com", "secret-token")).toEqual({ cnameOk: true, txtOk: false });
  });

  it("flags both false when neither record resolves", async () => {
    mockResolveCname.mockRejectedValue(new Error("NXDOMAIN"));
    mockResolveTxt.mockRejectedValue(new Error("NXDOMAIN"));

    expect(await checkDomainDns("menu.example.com", "secret-token")).toEqual({ cnameOk: false, txtOk: false });
  });

  it("joins multi-chunk TXT records before comparing", async () => {
    mockResolveCname.mockResolvedValue(["edge.sites.ordervora.example"]);
    mockResolveTxt.mockResolvedValue([["secret-", "token"]]);

    expect(await checkDomainDns("menu.example.com", "secret-token")).toEqual({ cnameOk: true, txtOk: true });
  });
});

describe("addDomain", () => {
  it("throws DomainAlreadyClaimedError when the hostname is already registered to any site", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", restaurantId: "restaurant-1" } as never);
    mockPrisma.domain.findUnique.mockResolvedValue({ id: "existing" } as never);

    await expect(addDomain("restaurant-1", "site-1", "menu.example.com")).rejects.toBeInstanceOf(DomainAlreadyClaimedError);
  });

  it("throws InvalidDomainError when the hostname is our own platform domain or a subdomain of it", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", restaurantId: "restaurant-1" } as never);

    await expect(addDomain("restaurant-1", "site-1", "sites.ordervora.example")).rejects.toBeInstanceOf(InvalidDomainError);
    await expect(addDomain("restaurant-1", "site-1", "trattoria.sites.ordervora.example")).rejects.toBeInstanceOf(InvalidDomainError);
    expect(mockPrisma.domain.create).not.toHaveBeenCalled();
  });

  it("creates a PENDING/PENDING domain row and logs a CREATED event", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", restaurantId: "restaurant-1" } as never);
    mockPrisma.domain.findUnique.mockResolvedValue(null);
    mockPrisma.domain.create.mockResolvedValue({ id: "domain-1", hostname: "menu.example.com" } as never);

    await addDomain("restaurant-1", "site-1", "menu.example.com");

    expect(mockPrisma.domain.create).toHaveBeenCalledWith({
      data: { siteId: "site-1", hostname: "menu.example.com", type: "CUSTOM", verificationStatus: "PENDING", tlsStatus: "PENDING" },
    });
    expect(mockPrisma.domainEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ siteId: "site-1", domainId: "domain-1", type: "CREATED" }) }),
    );
  });
});

describe("verifyDomain", () => {
  it("throws DomainNotFoundError for a domain belonging to a different site", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", restaurantId: "restaurant-1" } as never);
    mockPrisma.domain.findUnique.mockResolvedValue({ id: "d1", siteId: "other-site" } as never);

    await expect(verifyDomain("restaurant-1", "site-1", "d1")).rejects.toBeInstanceOf(DomainNotFoundError);
  });

  it("sets verificationStatus to VERIFIED and kicks off SSL generation when both DNS records check out", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", restaurantId: "restaurant-1" } as never);
    mockPrisma.domain.findUnique.mockResolvedValue({ id: "d1", siteId: "site-1", hostname: "menu.example.com", verificationToken: "secret-token" } as never);
    mockResolveCname.mockResolvedValue(["edge.sites.ordervora.example"]);
    mockResolveTxt.mockResolvedValue([["secret-token"]]);
    mockPrisma.domain.update.mockResolvedValue({ id: "d1", verificationStatus: "VERIFIED", tlsStatus: "GENERATING" } as never);

    const result = await verifyDomain("restaurant-1", "site-1", "d1");

    expect(result.verificationStatus).toBe("VERIFIED");
    expect(mockPrisma.domain.update).toHaveBeenCalledWith({
      where: { id: "d1" },
      data: { verificationStatus: "VERIFIED", lastCheckedAt: expect.any(Date), tlsStatus: "GENERATING" },
    });
    expect(mockPrisma.domainEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: "VERIFIED" }) }));
    expect(mockPrisma.domainEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: "SSL_GENERATING" }) }));
  });

  it("sets verificationStatus to FAILED (and leaves tlsStatus untouched) when DNS doesn't check out", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", restaurantId: "restaurant-1" } as never);
    mockPrisma.domain.findUnique.mockResolvedValue({ id: "d1", siteId: "site-1", hostname: "menu.example.com", verificationToken: "secret-token" } as never);
    mockResolveCname.mockRejectedValue(new Error("NXDOMAIN"));
    mockResolveTxt.mockRejectedValue(new Error("NXDOMAIN"));
    mockPrisma.domain.update.mockResolvedValue({ id: "d1", verificationStatus: "FAILED" } as never);

    const result = await verifyDomain("restaurant-1", "site-1", "d1");

    expect(result.verificationStatus).toBe("FAILED");
    expect(mockPrisma.domain.update).toHaveBeenCalledWith({
      where: { id: "d1" },
      data: { verificationStatus: "FAILED", lastCheckedAt: expect.any(Date) },
    });
    expect(mockPrisma.domainEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "VERIFICATION_FAILED", message: expect.stringContaining("both") }),
      }),
    );
  });

  it("fails verification when only the CNAME is right but the TXT ownership token doesn't match", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", restaurantId: "restaurant-1" } as never);
    mockPrisma.domain.findUnique.mockResolvedValue({ id: "d1", siteId: "site-1", hostname: "menu.example.com", verificationToken: "secret-token" } as never);
    mockResolveCname.mockResolvedValue(["edge.sites.ordervora.example"]);
    mockResolveTxt.mockResolvedValue([["wrong-token"]]);
    mockPrisma.domain.update.mockResolvedValue({ id: "d1", verificationStatus: "FAILED" } as never);

    const result = await verifyDomain("restaurant-1", "site-1", "d1");

    expect(result.verificationStatus).toBe("FAILED");
    expect(mockPrisma.domainEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ message: expect.stringContaining("TXT") }) }),
    );
  });
});

describe("setPrimaryDomain", () => {
  it("rejects a domain that hasn't been verified yet", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", restaurantId: "restaurant-1" } as never);
    mockPrisma.domain.findUnique.mockResolvedValue({ id: "d1", siteId: "site-1", verificationStatus: "PENDING" } as never);

    await expect(setPrimaryDomain("restaurant-1", "site-1", "d1")).rejects.toBeInstanceOf(DomainNotFoundError);
  });

  it("clears isPrimary on other domains before setting the new one, and logs a PRIMARY_CHANGED event", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", restaurantId: "restaurant-1" } as never);
    mockPrisma.domain.findUnique.mockResolvedValue({ id: "d1", siteId: "site-1", hostname: "menu.example.com", verificationStatus: "VERIFIED" } as never);
    mockPrisma.domain.update.mockResolvedValue({ id: "d1", isPrimary: true } as never);

    await setPrimaryDomain("restaurant-1", "site-1", "d1");

    expect(mockPrisma.domain.updateMany).toHaveBeenCalledWith({ where: { siteId: "site-1" }, data: { isPrimary: false } });
    expect(mockPrisma.domain.update).toHaveBeenCalledWith({ where: { id: "d1" }, data: { isPrimary: true } });
    expect(mockPrisma.domainEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: "PRIMARY_CHANGED" }) }));
  });
});

describe("removeDomain", () => {
  it("only deletes a domain that belongs to the caller's own site", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", restaurantId: "restaurant-1" } as never);
    mockPrisma.domain.findUnique.mockResolvedValue({ id: "d1", siteId: "other-site" } as never);

    await expect(removeDomain("restaurant-1", "site-1", "d1")).rejects.toBeInstanceOf(DomainNotFoundError);
    expect(mockPrisma.domain.delete).not.toHaveBeenCalled();
  });

  it("logs a DISCONNECTED event before deleting the domain row", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", restaurantId: "restaurant-1" } as never);
    mockPrisma.domain.findUnique.mockResolvedValue({ id: "d1", siteId: "site-1", hostname: "menu.example.com" } as never);

    await removeDomain("restaurant-1", "site-1", "d1");

    expect(mockPrisma.domainEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: "DISCONNECTED" }) }));
    expect(mockPrisma.domain.delete).toHaveBeenCalledWith({ where: { id: "d1" } });
  });
});

describe("runSslIssuanceSweep", () => {
  it("issues a certificate for every GENERATING domain and logs SSL_ACTIVE", async () => {
    mockPrisma.domain.findMany.mockResolvedValue([{ id: "d1", siteId: "site-1", hostname: "menu.example.com" }] as never);
    mockPrisma.domain.update.mockResolvedValue({} as never);
    mockPrisma.domain.updateMany.mockResolvedValue({ count: 0 } as never);

    const result = await runSslIssuanceSweep();

    expect(result.processedCount).toBe(1);
    expect(mockPrisma.domain.update).toHaveBeenCalledWith({
      where: { id: "d1" },
      data: { tlsStatus: "ACTIVE", tlsExpiresAt: expect.any(Date) },
    });
    expect(mockPrisma.domainEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: "SSL_ACTIVE" }) }));
  });

  it("expires ACTIVE domains whose tlsExpiresAt has passed", async () => {
    mockPrisma.domain.findMany.mockResolvedValue([] as never);
    mockPrisma.domain.updateMany.mockResolvedValue({ count: 2 } as never);

    const result = await runSslIssuanceSweep();

    expect(result.processedCount).toBe(2);
    expect(mockPrisma.domain.updateMany).toHaveBeenCalledWith({
      where: { tlsStatus: "ACTIVE", tlsExpiresAt: { lt: expect.any(Date) } },
      data: { tlsStatus: "EXPIRED" },
    });
  });
});

describe("listDomainHistory", () => {
  it("returns the site's full domain event history, newest first", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({ id: "site-1", restaurantId: "restaurant-1" } as never);
    mockPrisma.domainEvent.findMany.mockResolvedValue([{ id: "evt-1" }] as never);

    const events = await listDomainHistory("restaurant-1", "site-1");

    expect(mockPrisma.domainEvent.findMany).toHaveBeenCalledWith({ where: { siteId: "site-1" }, orderBy: { createdAt: "desc" } });
    expect(events).toEqual([{ id: "evt-1" }]);
  });
});
