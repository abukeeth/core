import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    restaurant: { findUnique: vi.fn() },
    paymentProvider: { count: vi.fn() },
    menuItem: { count: vi.fn() },
    site: { findUnique: vi.fn() },
    onboardingStatus: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}));

import { prisma } from "../../lib/prisma";
import { NoRestaurantError } from "../restaurants/restaurant.errors";
import { getOnboardingProgress, recordOnboardingActivity, recordOnboardingSkip } from "./onboarding.service";

const mockPrisma = vi.mocked(prisma, { deep: true });

interface Scenario {
  setupStep: string;
  name?: string;
  address?: string | null;
  connectedProviders?: number;
  menuItems?: number;
  site?: { status: string; generationJobs: number } | null;
  status?: Record<string, Date | null> | null;
}

function arrange(s: Scenario) {
  mockPrisma.user.findUnique.mockResolvedValue({ restaurantId: "r1" } as never);
  mockPrisma.restaurant.findUnique.mockResolvedValue({
    id: "r1",
    setupStep: s.setupStep,
    name: s.name ?? "My Business",
    address: s.address ?? null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
  } as never);
  mockPrisma.paymentProvider.count.mockResolvedValue((s.connectedProviders ?? 0) as never);
  mockPrisma.menuItem.count.mockResolvedValue((s.menuItems ?? 0) as never);
  mockPrisma.site.findUnique.mockResolvedValue(
    s.site ? ({ status: s.site.status, _count: { generationJobs: s.site.generationJobs } } as never) : null,
  );
  mockPrisma.onboardingStatus.findUnique.mockResolvedValue((s.status ?? null) as never);
}

beforeEach(() => vi.clearAllMocks());

describe("getOnboardingProgress — derives per-step state from real data", () => {
  it("a brand-new business (step 2) has only business type done, the rest pending", async () => {
    arrange({ setupStep: "BUSINESS_INFO" });
    const p = await getOnboardingProgress("u1");
    expect(p.currentStep).toBe("BUSINESS_INFO");
    expect(p.complete).toBe(false);
    expect(p.steps.businessType.state).toBe("done");
    expect(p.steps.businessInfo.state).toBe("pending");
    expect(p.steps.location.state).toBe("pending");
    expect(p.steps.payment.state).toBe("pending");
    expect(p.steps.menu.state).toBe("pending");
    expect(p.steps.website.state).toBe("pending");
  });

  it("marks business info and location done once the name and address are set", async () => {
    arrange({ setupStep: "PAYMENT_PROVIDER", name: "Joe's Diner", address: "123 Main St" });
    const p = await getOnboardingProgress("u1");
    expect(p.steps.businessInfo.state).toBe("done");
    expect(p.steps.location.state).toBe("done");
    expect(p.steps.payment.state).toBe("pending"); // current step, not moved past
  });

  it("treats an optional step advanced past without its data as skipped (Stripe skipped)", async () => {
    arrange({ setupStep: "MENU_IMPORT", name: "Joe's", address: "123 Main St", connectedProviders: 0 });
    const p = await getOnboardingProgress("u1");
    expect(p.steps.payment.state).toBe("skipped");
    expect(p.steps.payment.skipped).toBe(true);
    expect(p.steps.menu.state).toBe("pending");
  });

  it("marks payment done when a provider is CONNECTED", async () => {
    arrange({ setupStep: "MENU_IMPORT", name: "Joe's", address: "123 Main St", connectedProviders: 1 });
    const p = await getOnboardingProgress("u1");
    expect(p.steps.payment.state).toBe("done");
  });

  it("honors an explicit skip flag even on the current step", async () => {
    arrange({ setupStep: "PAYMENT_PROVIDER", name: "Joe's", address: "123 Main St", status: { paymentSkippedAt: new Date() } });
    const p = await getOnboardingProgress("u1");
    expect(p.steps.payment.state).toBe("skipped");
  });

  it("marks menu done when at least one product exists, and website done when a Site + generation job exist", async () => {
    arrange({
      setupStep: "DONE",
      name: "Joe's",
      address: "123 Main St",
      connectedProviders: 1,
      menuItems: 12,
      site: { status: "DRAFT", generationJobs: 1 },
    });
    const p = await getOnboardingProgress("u1");
    expect(p.steps.menu.state).toBe("done");
    expect(p.steps.website.state).toBe("done");
    expect(p.complete).toBe(true);
  });

  it("marks website skipped when onboarding reached DONE with no site", async () => {
    arrange({ setupStep: "DONE", name: "Joe's", address: "123 Main St", menuItems: 3, site: null });
    const p = await getOnboardingProgress("u1");
    expect(p.steps.website.state).toBe("skipped");
    expect(p.complete).toBe(true);
  });

  it("throws NoRestaurantError when the user has no business yet", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ restaurantId: null } as never);
    await expect(getOnboardingProgress("u1")).rejects.toBeInstanceOf(NoRestaurantError);
  });
});

describe("recordOnboardingActivity / recordOnboardingSkip — persist the lifecycle", () => {
  it("stamps completedAt when reaching DONE", async () => {
    mockPrisma.onboardingStatus.upsert.mockResolvedValue({} as never);
    await recordOnboardingActivity("r1", "DONE");
    const arg = mockPrisma.onboardingStatus.upsert.mock.calls[0]![0] as { update: Record<string, unknown> };
    expect(arg.update).toHaveProperty("completedAt");
  });

  it("does not stamp completedAt for a mid-wizard step", async () => {
    mockPrisma.onboardingStatus.upsert.mockResolvedValue({} as never);
    await recordOnboardingActivity("r1", "MENU_IMPORT");
    const arg = mockPrisma.onboardingStatus.upsert.mock.calls[0]![0] as { update: Record<string, unknown> };
    expect(arg.update).not.toHaveProperty("completedAt");
  });

  it("records an explicit skip and returns fresh progress", async () => {
    arrange({ setupStep: "MENU_IMPORT", name: "Joe's", address: "123 Main St" });
    mockPrisma.onboardingStatus.upsert.mockResolvedValue({} as never);
    const p = await recordOnboardingSkip("u1", "MENU");
    expect(mockPrisma.onboardingStatus.upsert).toHaveBeenCalled();
    const arg = mockPrisma.onboardingStatus.upsert.mock.calls[0]![0] as { update: Record<string, unknown> };
    expect(arg.update).toHaveProperty("menuSkippedAt");
    expect(p.currentStep).toBe("MENU_IMPORT");
  });
});
