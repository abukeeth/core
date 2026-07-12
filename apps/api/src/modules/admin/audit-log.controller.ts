import type { Request, Response } from "express";
import { listAuditLog } from "./audit-log.service";
import { listAuditLogSchema } from "./audit-log.validation";

export async function listAuditLogHandler(req: Request, res: Response): Promise<void> {
  const parsed = listAuditLogSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }
  const entries = await listAuditLog(parsed.data.limit);
  res.status(200).json({ entries });
}
