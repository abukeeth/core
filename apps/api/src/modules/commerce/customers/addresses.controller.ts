import type { Request, Response } from "express";
import { CustomerAddressNotFoundError } from "./customers.errors";
import { createAddressSchema, updateAddressSchema } from "./customers.validation";
import { createAddress, deleteAddress, listAddresses, updateAddress } from "./addresses.service";

function paramId(req: Request): string {
  return req.params.id as string;
}

export async function listAddressesHandler(req: Request, res: Response): Promise<void> {
  res.status(200).json({ addresses: await listAddresses(req.customer!.id) });
}

export async function createAddressHandler(req: Request, res: Response): Promise<void> {
  const parsed = createAddressSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }
  res.status(201).json({ address: await createAddress(req.customer!.id, parsed.data) });
}

export async function updateAddressHandler(req: Request, res: Response): Promise<void> {
  const parsed = updateAddressSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    res.status(200).json({ address: await updateAddress(req.customer!.id, paramId(req), parsed.data) });
  } catch (err) {
    if (err instanceof CustomerAddressNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function deleteAddressHandler(req: Request, res: Response): Promise<void> {
  try {
    await deleteAddress(req.customer!.id, paramId(req));
    res.status(204).send();
  } catch (err) {
    if (err instanceof CustomerAddressNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}
