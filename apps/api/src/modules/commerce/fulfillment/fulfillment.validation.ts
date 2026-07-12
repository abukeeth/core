import { FulfillmentDetailStatus } from "@prisma/client";
import { z } from "zod";

export const connectProviderSchema = z.object({
  credentials: z.string().min(1),
});

export const assignDriverSchema = z.object({
  driverId: z.uuid(),
});

export const updateFulfillmentStatusSchema = z.object({
  status: z.enum(FulfillmentDetailStatus),
});

export const locationPingSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const respondToAssignmentSchema = z.object({
  accept: z.boolean(),
});

export type ConnectProviderInput = z.infer<typeof connectProviderSchema>;
export type AssignDriverInput = z.infer<typeof assignDriverSchema>;
export type UpdateFulfillmentStatusInput = z.infer<typeof updateFulfillmentStatusSchema>;
export type LocationPingInput = z.infer<typeof locationPingSchema>;
export type RespondToAssignmentInput = z.infer<typeof respondToAssignmentSchema>;
