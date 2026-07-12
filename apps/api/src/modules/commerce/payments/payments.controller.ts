import type { PaymentMethodType, PaymentProviderType } from "@prisma/client";
import type { Request, Response } from "express";
import { NoRestaurantError } from "../../restaurants/restaurant.errors";
import { getOwnRestaurantId } from "../../restaurants/restaurant.service";
import { listMethods, setMethodEnabled } from "./method.service";
import { PaymentProviderNotFoundError, PaymentProviderNotImplementedError } from "./payments.errors";
import { connectProviderSchema, updatePaymentMethodSchema, updateProviderPrioritySchema } from "./payments.validation";
import { connectProvider, disconnectProvider, listProviders, setProviderPriority } from "./provider.service";

function paramProviderType(req: Request): PaymentProviderType {
  return req.params.type as PaymentProviderType;
}

function paramMethodType(req: Request): PaymentMethodType {
  return req.params.methodType as PaymentMethodType;
}

async function requireOwnRestaurantId(req: Request, res: Response): Promise<string | null> {
  const restaurantId = await getOwnRestaurantId(req.user!.id);
  if (!restaurantId) {
    res.status(404).json({ error: new NoRestaurantError().message });
    return null;
  }
  return restaurantId;
}

export async function listProvidersHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;
  res.status(200).json({ providers: await listProviders(restaurantId) });
}

export async function connectProviderHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = connectProviderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const provider = await connectProvider(restaurantId, paramProviderType(req), parsed.data);
    res.status(200).json({ provider });
  } catch (err) {
    if (err instanceof PaymentProviderNotImplementedError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function disconnectProviderHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    await disconnectProvider(restaurantId, paramProviderType(req));
    res.status(204).send();
  } catch (err) {
    if (err instanceof PaymentProviderNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function updateProviderPriorityHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = updateProviderPrioritySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const provider = await setProviderPriority(restaurantId, paramProviderType(req), parsed.data);
    res.status(200).json({ provider });
  } catch (err) {
    if (err instanceof PaymentProviderNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function listMethodsHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;
  res.status(200).json({ methods: await listMethods(restaurantId) });
}

export async function updateMethodHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = updatePaymentMethodSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const method = await setMethodEnabled(restaurantId, paramMethodType(req), parsed.data);
    res.status(200).json({ method });
  } catch (err) {
    if (err instanceof PaymentProviderNotFoundError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
}
