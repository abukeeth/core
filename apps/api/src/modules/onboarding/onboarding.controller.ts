import type { Request, Response } from "express";
import { NoRestaurantError } from "../restaurants/restaurant.errors";
import { getOnboardingProgress, recordOnboardingSkip } from "./onboarding.service";
import { onboardingProgressPatchSchema } from "./onboarding.validation";

export async function getProgress(req: Request, res: Response): Promise<void> {
  try {
    const progress = await getOnboardingProgress(req.user!.id);
    res.status(200).json({ progress });
  } catch (err) {
    if (err instanceof NoRestaurantError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function patchProgress(req: Request, res: Response): Promise<void> {
  const parsed = onboardingProgressPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid onboarding progress update" });
    return;
  }

  try {
    const progress = parsed.data.skip
      ? await recordOnboardingSkip(req.user!.id, parsed.data.skip)
      : await getOnboardingProgress(req.user!.id);
    res.status(200).json({ progress });
  } catch (err) {
    if (err instanceof NoRestaurantError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}
