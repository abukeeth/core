import { z } from "zod";

export const onboardingProgressPatchSchema = z.object({
  // Record an explicit "Skip for now" for an optional step. Omit to simply
  // touch activity / re-read progress.
  skip: z.enum(["PAYMENT", "MENU", "WEBSITE"]).optional(),
});

export type OnboardingProgressPatchInput = z.infer<typeof onboardingProgressPatchSchema>;
