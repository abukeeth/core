import type { FulfillmentProviderType } from "@prisma/client";
import type { Request, Response } from "express";
import { NoRestaurantError } from "../../restaurants/restaurant.errors";
import { getOwnRestaurantId } from "../../restaurants/restaurant.service";
import {
  DriverAlreadyBusyError,
  DriverAssignmentNotFoundError,
  DriverNotOnStaffError,
  FulfillmentNotFoundError,
  FulfillmentProviderNotFoundError,
  FulfillmentProviderNotImplementedError,
} from "./fulfillment.errors";
import {
  assignDriver,
  getDriverAssignmentByFulfillment,
  getFulfillment,
  listDriverCandidates,
  listMyDriverAssignments,
  recordLocationPing,
  respondToAssignment,
  updateFulfillmentStatus,
} from "./fulfillment.service";
import {
  assignDriverSchema,
  connectProviderSchema,
  locationPingSchema,
  respondToAssignmentSchema,
  updateFulfillmentStatusSchema,
} from "./fulfillment.validation";
import { connectProvider, disconnectProvider, listProviders } from "./provider.service";

function paramId(req: Request): string {
  return req.params.id as string;
}

function paramProviderType(req: Request): FulfillmentProviderType {
  return req.params.type as FulfillmentProviderType;
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

  const providers = await listProviders(restaurantId);
  res.status(200).json({ providers });
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
    const provider = await connectProvider(restaurantId, paramProviderType(req), parsed.data.credentials);
    res.status(200).json({ provider });
  } catch (err) {
    if (err instanceof FulfillmentProviderNotImplementedError) {
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
    const provider = await disconnectProvider(restaurantId, paramProviderType(req));
    res.status(200).json({ provider });
  } catch (err) {
    if (err instanceof FulfillmentProviderNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

/** Eligible driver candidates (this restaurant's staff) for the assign-driver dashboard control. */
export async function listDriverCandidatesHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const drivers = await listDriverCandidates(restaurantId);
  res.status(200).json({ drivers });
}

export async function assignDriverHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = assignDriverSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const assignment = await assignDriver(restaurantId, paramId(req), parsed.data.driverId);
    res.status(200).json({ assignment });
  } catch (err) {
    if (err instanceof FulfillmentNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof DriverNotOnStaffError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof DriverAlreadyBusyError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function updateFulfillmentStatusHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = updateFulfillmentStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const fulfillment = await updateFulfillmentStatus(restaurantId, paramId(req), parsed.data.status);
    res.status(200).json({ fulfillment });
  } catch (err) {
    if (err instanceof FulfillmentNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

/**
 * Driver app posts its own position. Beyond requireAuth/requireRole
 * (staff-or-owner, same as the rest of this router), this additionally
 * checks that the authenticated caller IS the driver assigned to this
 * fulfillment — a same-tenant *authorization* check, not tenant
 * isolation, so a mismatch is 403 (the resource visibly exists to other
 * staff of the same restaurant; it just isn't this staffer's delivery to
 * update), not 404.
 */
export async function locationPingHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = locationPingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const fulfillment = await getFulfillment(restaurantId, paramId(req));
    const assignment = await getDriverAssignmentByFulfillment(fulfillment.id);
    if (!assignment) {
      throw new DriverAssignmentNotFoundError();
    }
    if (assignment.driverId !== req.user!.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const updated = await recordLocationPing(assignment.id, parsed.data.lat, parsed.data.lng);
    res.status(200).json({ assignment: updated });
  } catch (err) {
    if (err instanceof FulfillmentNotFoundError || err instanceof DriverAssignmentNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

/** The driver app's own queue — every staffer sees only their own currently-active assignments. */
export async function myAssignmentsHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const assignments = await listMyDriverAssignments(restaurantId, req.user!.id);
  res.status(200).json({ assignments });
}

/** A driver accepting/declining an OFFERED delivery. Tenant isolation is implicit — findOwnDriverAssignment scopes by driverId, so a mismatch is a 404, not a 403 (this driver never had this job). */
export async function respondToAssignmentHandler(req: Request, res: Response): Promise<void> {
  const parsed = respondToAssignmentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const assignment = await respondToAssignment(req.user!.id, paramId(req), parsed.data.accept);
    res.status(200).json({ assignment });
  } catch (err) {
    if (err instanceof DriverAssignmentNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}
