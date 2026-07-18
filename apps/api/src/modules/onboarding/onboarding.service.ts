import { ProviderConnectionStatus, SiteStatus, type SetupStep } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { NoRestaurantError } from "../restaurants/restaurant.errors";

/**
 * The `onboarding_progress` read model (§ onboarding). The authoritative
 * *data* for each step lives in its own tables — this derives a per-step
 * done/skipped view from that real data, so the wizard (and any dashboard
 * "finish setup" surface) can resume exactly where the owner left off, and
 * so completion is queryable. Explicit "Skip for now" decisions are read
 * from OnboardingStatus; a step the owner advanced past without its data is
 * treated as skipped even when no explicit flag was recorded.
 */

const STEP_ORDER: SetupStep[] = [
  "BUSINESS_TYPE",
  "BUSINESS_INFO",
  "LOCATION",
  "PAYMENT_PROVIDER",
  "MENU_IMPORT",
  "WEBSITE_THEME",
  "DONE",
];

/** createRestaurant seeds this placeholder name until Business Info is filled in. */
const DEFAULT_BUSINESS_NAME = "My Business";

export type OnboardingStepState = "pending" | "done" | "skipped";

export interface OnboardingStepStatus {
  done: boolean;
  skipped: boolean;
  state: OnboardingStepState;
}

export interface OnboardingProgress {
  currentStep: SetupStep;
  complete: boolean;
  startedAt: string | null;
  lastActiveAt: string | null;
  completedAt: string | null;
  steps: {
    businessType: OnboardingStepStatus;
    businessInfo: OnboardingStepStatus;
    location: OnboardingStepStatus;
    payment: OnboardingStepStatus;
    menu: OnboardingStepStatus;
    website: OnboardingStepStatus;
  };
}

export type SkippableStep = "PAYMENT" | "MENU" | "WEBSITE";

const SKIP_FIELD: Record<SkippableStep, "paymentSkippedAt" | "menuSkippedAt" | "websiteSkippedAt"> = {
  PAYMENT: "paymentSkippedAt",
  MENU: "menuSkippedAt",
  WEBSITE: "websiteSkippedAt",
};

function stepIndex(step: SetupStep): number {
  return STEP_ORDER.indexOf(step);
}

function statusFor(done: boolean, movedPast: boolean, explicitlySkipped: boolean): OnboardingStepStatus {
  if (done) return { done: true, skipped: false, state: "done" };
  const skipped = explicitlySkipped || movedPast;
  return { done: false, skipped, state: skipped ? "skipped" : "pending" };
}

async function resolveOwnRestaurantId(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { restaurantId: true } });
  if (!user?.restaurantId) throw new NoRestaurantError();
  return user.restaurantId;
}

export async function getOnboardingProgress(userId: string): Promise<OnboardingProgress> {
  const restaurantId = await resolveOwnRestaurantId(userId);
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
  if (!restaurant) throw new NoRestaurantError();

  const [connectedProviders, menuItemCount, site, status] = await Promise.all([
    prisma.paymentProvider.count({ where: { restaurantId, status: ProviderConnectionStatus.CONNECTED } }),
    prisma.menuItem.count({ where: { restaurantId } }),
    prisma.site.findUnique({ where: { restaurantId }, include: { _count: { select: { generationJobs: true } } } }),
    prisma.onboardingStatus.findUnique({ where: { restaurantId } }),
  ]);

  const movedPast = (step: SetupStep): boolean => stepIndex(restaurant.setupStep) > stepIndex(step);

  const businessTypeDone = true; // a Restaurant row exists → a business type was chosen at creation
  const businessInfoDone = Boolean(restaurant.name && restaurant.name !== DEFAULT_BUSINESS_NAME);
  const locationDone = Boolean(restaurant.address && restaurant.address.trim());
  const paymentDone = connectedProviders > 0;
  const menuDone = menuItemCount > 0;
  const websiteDone = Boolean(site && (site._count.generationJobs > 0 || site.status === SiteStatus.PUBLISHED));

  return {
    currentStep: restaurant.setupStep,
    complete: restaurant.setupStep === "DONE",
    startedAt: (status?.startedAt ?? restaurant.createdAt).toISOString(),
    lastActiveAt: (status?.lastActiveAt ?? restaurant.updatedAt).toISOString(),
    completedAt: status?.completedAt?.toISOString() ?? null,
    steps: {
      businessType: statusFor(businessTypeDone, movedPast("BUSINESS_TYPE"), false),
      businessInfo: statusFor(businessInfoDone, movedPast("BUSINESS_INFO"), false),
      location: statusFor(locationDone, movedPast("LOCATION"), false),
      payment: statusFor(paymentDone, movedPast("PAYMENT_PROVIDER"), Boolean(status?.paymentSkippedAt)),
      menu: statusFor(menuDone, movedPast("MENU_IMPORT"), Boolean(status?.menuSkippedAt)),
      website: statusFor(websiteDone, movedPast("WEBSITE_THEME"), Boolean(status?.websiteSkippedAt)),
    },
  };
}

/**
 * Stamp the onboarding record as the owner progresses — called (best-effort)
 * from setSetupStep so "last active" advances and completion is recorded
 * without any UI change. Idempotent upsert.
 */
export async function recordOnboardingActivity(restaurantId: string, setupStep: SetupStep): Promise<void> {
  const now = new Date();
  const completed = setupStep === "DONE" ? now : undefined;
  await prisma.onboardingStatus.upsert({
    where: { restaurantId },
    create: { restaurantId, startedAt: now, lastActiveAt: now, completedAt: completed ?? null },
    update: { lastActiveAt: now, ...(completed ? { completedAt: completed } : {}) },
  });
}

/** Ensure a status row exists the moment a business is created (best-effort). */
export async function ensureOnboardingStatus(restaurantId: string): Promise<void> {
  const now = new Date();
  await prisma.onboardingStatus.upsert({
    where: { restaurantId },
    create: { restaurantId, startedAt: now, lastActiveAt: now },
    update: {},
  });
}

/** Record an explicit "Skip for now" for an optional step, then return fresh progress. */
export async function recordOnboardingSkip(userId: string, step: SkippableStep): Promise<OnboardingProgress> {
  const restaurantId = await resolveOwnRestaurantId(userId);
  const now = new Date();
  const field = SKIP_FIELD[step];
  await prisma.onboardingStatus.upsert({
    where: { restaurantId },
    create: { restaurantId, startedAt: now, lastActiveAt: now, [field]: now },
    update: { lastActiveAt: now, [field]: now },
  });
  return getOnboardingProgress(userId);
}
