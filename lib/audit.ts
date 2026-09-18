import { prisma } from "./prisma";

export interface AuditEntry {
  userId: string;
  roleCode: string;
  object: string;
  objectId: string;
  operation: string;
  oldValue?: string | null;
  newValue?: string | null;
}

export async function writeAudit(entry: AuditEntry): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: entry.userId,
      roleCode: entry.roleCode,
      object: entry.object,
      objectId: entry.objectId,
      operation: entry.operation,
      oldValue: entry.oldValue ?? null,
      newValue: entry.newValue ?? null,
    },
  });
}

export async function getSystemDate(): Promise<string> {
  const config = await prisma.config.findUnique({ where: { id: "system" } });
  return config?.systemDate ? new Date(config.systemDate).toISOString() : new Date().toISOString();
}