import { logAdminAudit } from "@/lib/admin/audit";

type BillingAuditActor = {
  id: string;
  tenantId: string;
  email: string;
  role: "admin" | "member";
  isPlatformAdmin: boolean;
};

type BillingAuditInput = {
  actor: BillingAuditActor;
  action: string;
  summary: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function logBillingAdminAudit(input: BillingAuditInput) {
  await logAdminAudit({
    actorUserId: input.actor.id,
    actorTenantId: input.actor.tenantId,
    targetTenantId: input.actor.tenantId,
    action: input.action,
    entityType: "billing",
    entityId: input.entityId ?? null,
    summary: input.summary,
    metadata: {
      actorEmail: input.actor.email,
      actorRole: input.actor.role,
      isPlatformAdmin: input.actor.isPlatformAdmin,
      ...(input.metadata ?? {})
    }
  });
}
