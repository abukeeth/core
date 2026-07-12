import type { Request, Response } from "express";
import { NoRestaurantError } from "../../restaurants/restaurant.errors";
import { getOwnRestaurantId } from "../../restaurants/restaurant.service";
import { getOrCreateProgram, getAccountSummary, updateProgram } from "./loyalty.service";
import { updateLoyaltyProgramSchema } from "./loyalty.validation";

export async function getOwnProgramHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await getOwnRestaurantId(req.user!.id);
  if (!restaurantId) {
    res.status(404).json({ error: new NoRestaurantError().message });
    return;
  }
  res.status(200).json({ program: await getOrCreateProgram(restaurantId) });
}

export async function updateOwnProgramHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await getOwnRestaurantId(req.user!.id);
  if (!restaurantId) {
    res.status(404).json({ error: new NoRestaurantError().message });
    return;
  }
  const parsed = updateLoyaltyProgramSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }
  res.status(200).json({ program: await updateProgram(restaurantId, parsed.data) });
}

export async function getCustomerAccountSummaryHandler(req: Request, res: Response): Promise<void> {
  const summary = await getAccountSummary(req.customer!.id, req.params.restaurantId as string);
  res.status(200).json(summary);
}
