import type { Request, Response } from "express";
import { CustomerPaymentMethodNotFoundError } from "./customers.errors";
import { createPaymentMethodSchema } from "./customers.validation";
import { createPaymentMethod, deletePaymentMethod, listPaymentMethods } from "./payment-methods.service";

export async function listPaymentMethodsHandler(req: Request, res: Response): Promise<void> {
  res.status(200).json({ paymentMethods: await listPaymentMethods(req.customer!.id) });
}

export async function createPaymentMethodHandler(req: Request, res: Response): Promise<void> {
  const parsed = createPaymentMethodSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }
  res.status(201).json({ paymentMethod: await createPaymentMethod(req.customer!.id, parsed.data) });
}

export async function deletePaymentMethodHandler(req: Request, res: Response): Promise<void> {
  try {
    await deletePaymentMethod(req.customer!.id, req.params.id as string);
    res.status(204).send();
  } catch (err) {
    if (err instanceof CustomerPaymentMethodNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}
