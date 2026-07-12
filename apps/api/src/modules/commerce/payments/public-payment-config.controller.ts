import type { Request, Response } from "express";
import { getPublicPaymentConfig } from "./public-payment-config.service";

export async function getPublicPaymentConfigHandler(req: Request, res: Response): Promise<void> {
  const config = await getPublicPaymentConfig(req.params.restaurantId as string);
  res.status(200).json({ config });
}
