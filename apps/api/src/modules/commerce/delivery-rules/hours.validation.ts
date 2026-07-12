import { HoursDayOfWeek } from "@prisma/client";
import { z } from "zod";

const hoursRowSchema = z
  .object({
    dayOfWeek: z.enum(HoursDayOfWeek),
    opensAt: z.number().int().min(0).max(1439),
    closesAt: z.number().int().min(0).max(1439),
    isClosed: z.boolean().default(false),
  })
  .refine((row) => row.isClosed || row.opensAt < row.closesAt, {
    message: "opensAt must be before closesAt for an open row",
    path: ["closesAt"],
  });

export const setHoursSchema = z.object({
  hours: z.array(hoursRowSchema),
});

export type HoursRowInput = z.infer<typeof hoursRowSchema>;
export type SetHoursInput = z.infer<typeof setHoursSchema>;
