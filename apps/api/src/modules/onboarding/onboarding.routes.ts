import { Router } from "express";
import { Role } from "@prisma/client";
import { requireAuth } from "../../middleware/require-auth";
import { requireRole } from "../../middleware/require-role";
import { getProgress, patchProgress } from "./onboarding.controller";

export const onboardingRouter = Router();

// Canonical onboarding-progress resource — resumable state for the setup
// wizard, derived from real business data plus explicit skip decisions.
onboardingRouter.get("/progress", requireAuth, requireRole(Role.RESTAURANT_OWNER, Role.RESTAURANT_STAFF), getProgress);
onboardingRouter.patch("/progress", requireAuth, requireRole(Role.RESTAURANT_OWNER), patchProgress);
