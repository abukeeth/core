import type { Request, Response } from "express";
import { listCustomerOrders } from "./order-history.service";

export async function listCustomerOrdersHandler(req: Request, res: Response): Promise<void> {
  res.status(200).json({ orders: await listCustomerOrders(req.customer!.id) });
}
