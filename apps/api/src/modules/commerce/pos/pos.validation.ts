import { z } from "zod";

export const connectPOSProviderSchema = z.object({
  credentials: z.string().min(1),
  syncDirection: z.enum(["MENU_IMPORT", "ORDER_EXPORT", "BIDIRECTIONAL"]).optional(),
});

export type ConnectPOSProviderInput = z.infer<typeof connectPOSProviderSchema>;

export const updateSyncDirectionSchema = z.object({
  syncDirection: z.enum(["MENU_IMPORT", "ORDER_EXPORT", "BIDIRECTIONAL"]),
});

export type UpdateSyncDirectionInput = z.infer<typeof updateSyncDirectionSchema>;
