import { z } from "zod";

const radiusGeometrySchema = z.object({
  type: z.literal("radius"),
  centerLat: z.number().min(-90).max(90),
  centerLng: z.number().min(-180).max(180),
  radiusMiles: z.number().positive(),
});

const polygonGeometrySchema = z.object({
  type: z.literal("polygon"),
  points: z.array(z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })).min(3),
});

export const zoneGeometrySchema = z.discriminatedUnion("type", [radiusGeometrySchema, polygonGeometrySchema]);

export const createDeliveryZoneSchema = z.object({
  name: z.string().min(1).max(128),
  geometry: zoneGeometrySchema,
  isActive: z.boolean().optional(),
});

export const updateDeliveryZoneSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  geometry: zoneGeometrySchema.optional(),
  isActive: z.boolean().optional(),
});

const fulfillmentMethodEnum = z.enum(["PICKUP", "RESTAURANT_DRIVER", "UBER_DIRECT", "DOORDASH_DRIVE", "LOCAL_COURIER"]);

export const createDeliveryRuleSchema = z.object({
  zoneId: z.uuid().optional(),
  minDistanceMiles: z.number().nonnegative().optional(),
  maxDistanceMiles: z.number().nonnegative().optional(),
  fulfillmentMethod: fulfillmentMethodEnum,
  priority: z.number().int().optional(),
  fallbackToRuleId: z.uuid().optional(),
  isActive: z.boolean().optional(),
});

export const updateDeliveryRuleSchema = createDeliveryRuleSchema.partial();

export type CreateDeliveryZoneInput = z.infer<typeof createDeliveryZoneSchema>;
export type UpdateDeliveryZoneInput = z.infer<typeof updateDeliveryZoneSchema>;
export type CreateDeliveryRuleInput = z.infer<typeof createDeliveryRuleSchema>;
export type UpdateDeliveryRuleInput = z.infer<typeof updateDeliveryRuleSchema>;
