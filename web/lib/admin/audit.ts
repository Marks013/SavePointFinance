import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma/client";

type AdminAuditInput = {
  actorUserId: string;
  actorTenantId: string;
  targetUserId?: string | null;
  targetTenantId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  metadata?: Record<string, unknown> | null;
};

export type { AdminAuditInput };

export async function logAdminAudit(input: AdminAuditInput) {
  await prisma.adminAuditLog.create({
    data: {
      actorUserId: input.actorUserId,
      actorTenantId: input.actorTenantId,
      targetUserId: input.targetUserId ?? null,
      targetTenantId: input.targetTenantId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      summary: input.summary,
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined
    }
  });
}
