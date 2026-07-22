import type { Request, Response } from "express";
import { NoRestaurantError } from "../../restaurants/restaurant.errors";
import { getOwnRestaurantId } from "../../restaurants/restaurant.service";
import { getOwnerCustomerDetail, getOwnerCustomerMetrics, listOwnerCustomers } from "./customers-owner.service";
import { customerListSchema } from "./customers-owner.validation";

export async function listCustomersHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await getOwnRestaurantId(req.user!.id);
  if (!restaurantId) {
    res.status(404).json({ error: new NoRestaurantError().message });
    return;
  }
  const parsed = customerListSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }
  const [customers, metrics] = await Promise.all([
    listOwnerCustomers(restaurantId, parsed.data.limit),
    getOwnerCustomerMetrics(restaurantId),
  ]);
  res.status(200).json({ customers, metrics });
}

export async function getCustomerHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await getOwnRestaurantId(req.user!.id);
  if (!restaurantId) {
    res.status(404).json({ error: new NoRestaurantError().message });
    return;
  }
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const detail = await getOwnerCustomerDetail(restaurantId, id);
  if (!detail) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  res.status(200).json({ customer: detail });
}
