import type { AdminAuditLog, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";

export interface AuditLogEntry {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: unknown;
  createdAt: Date;
  adminName: string;
}

export async function recordAuditLog(
  adminId: string,
  action: string,
  targetType: string,
  targetId: string,
  metadata?: Record<string, unknown>,
): Promise<AdminAuditLog> {
  return prisma.adminAuditLog.create({
    data: { adminId, action, targetType, targetId, metadata: metadata as Prisma.InputJsonValue | undefined },
  });
}

export async function listAuditLog(limit: number): Promise<AuditLogEntry[]> {
  const entries = await prisma.adminAuditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { admin: { select: { name: true } } },
  });
  return entries.map((entry) => ({
    id: entry.id,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    metadata: entry.metadata,
    createdAt: entry.createdAt,
    adminName: entry.admin.name,
  }));
}
