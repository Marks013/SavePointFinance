import { NextResponse } from "next/server";
import { z } from "zod";

import { logAdminAudit } from "@/lib/admin/audit";
import { requireAdminUser } from "@/lib/auth/admin";
import { captureRequestError } from "@/lib/observability/sentry";
import { getRetentionStats, runRetentionLifecycle, updateRetentionPolicy } from "@/lib/retention/service";

const retentionRunSchema = z.object({
  dryRun: z.boolean().optional().default(true),
  confirm: z.string().optional()
}).strict();
const retentionPolicySchema = z.object({
  enabled: z.boolean(),
  closureDays: z.coerce.number().int().min(90).max(3650)
}).strict();

async function requirePlatformAdmin() {
  const admin = await requireAdminUser();

  if (!admin.isPlatformAdmin) {
    throw new Error("Forbidden");
  }

  return admin;
}

export async function GET() {
  try {
    await requirePlatformAdmin();

    return NextResponse.json(await getRetentionStats());
  } catch (error) {
    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Forbidden")) {
      return NextResponse.json({ message: error.message }, { status: error.message === "Forbidden" ? 403 : 401 });
    }

    return NextResponse.json({ message: "Failed to load retention stats" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requirePlatformAdmin();

    const body = retentionRunSchema.parse(await request.json().catch(() => ({})));
    const dryRun = body.dryRun !== false;

    if (!dryRun && body.confirm !== "ENCERRAR-CONTAS") {
      return NextResponse.json(
        { message: "Confirmação inválida para executar encerramentos definitivos." },
        { status: 400 }
      );
    }

    const result = await runRetentionLifecycle({ dryRun });

    return NextResponse.json({
      message: dryRun ? "Simulação de retenção concluída" : "Rotina de retenção executada",
      result
    });
  } catch (error) {
    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Forbidden")) {
      return NextResponse.json({ message: error.message }, { status: error.message === "Forbidden" ? 403 : 401 });
    }

    captureRequestError(error, { request, feature: "retention-admin", surface: "admin" });
    return NextResponse.json({ message: "Failed to run retention lifecycle" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requirePlatformAdmin();

    const body = retentionPolicySchema.parse(await request.json().catch(() => ({})));

    const policy = await updateRetentionPolicy({
      enabled: body.enabled,
      closureDays: body.closureDays
    });

    await logAdminAudit({
      actorUserId: admin.id,
      actorTenantId: admin.tenantId,
      action: "retention.policy.updated",
      entityType: "retention",
      entityId: "retention.policy",
      summary: `Política de retenção ${policy.enabled ? "ativada" : "desativada"} com encerramento em ${policy.closureDays} dias`,
      metadata: policy
    });

    return NextResponse.json({
      message: "Política de retenção atualizada",
      policy
    });
  } catch (error) {
    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Forbidden")) {
      return NextResponse.json({ message: error.message }, { status: error.message === "Forbidden" ? 403 : 401 });
    }

    captureRequestError(error, { request, feature: "retention-admin", surface: "admin" });
    return NextResponse.json({ message: "Failed to update retention policy" }, { status: 500 });
  }
}
