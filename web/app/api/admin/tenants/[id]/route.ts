import { NextResponse } from "next/server";

import { logAdminAudit } from "@/lib/admin/audit";
import { requireAdminUser } from "@/lib/auth/admin";
import { applyPlanDefaultsToTenant } from "@/lib/licensing/default-plans";
import { prisma } from "@/lib/prisma/client";
import { deleteTenantWithAllData, getDeletableTenant } from "@/lib/tenants/delete-tenant";

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: Params) {
  try {
    const admin = await requireAdminUser();
    const { id } = await context.params;
    const body = (await request.json()) as {
      name?: string;
      planId?: string;
      isActive?: boolean;
      trialDays?: number;
      trialExpiresAt?: string | null;
      expiresAt?: string | null;
    };

    if (!admin.isPlatformAdmin && id !== admin.tenantId) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const target = await prisma.tenant.findUnique({
      where: {
        id
      },
      select: {
        id: true,
        planId: true
      }
    });

    if (!target) {
      return NextResponse.json({ message: "Conta não encontrada" }, { status: 404 });
    }

    let planUpdate:
      | {
          planId: string;
          trialStart: Date | null;
          trialDays: number;
          trialExpiresAt: Date | null;
        }
      | undefined;

    if (body.planId && body.planId !== target.planId) {
      const nextPlan = await prisma.plan.findFirst({
        where: {
          id: body.planId,
          isActive: true
        },
        select: {
          id: true,
          tier: true,
          trialDays: true
        }
      });

      if (!nextPlan) {
        return NextResponse.json({ message: "Plano não encontrado ou inativo" }, { status: 404 });
      }

      planUpdate = applyPlanDefaultsToTenant(nextPlan);
    }

    await prisma.tenant.update({
      where: {
        id
      },
      data: {
        ...(body.name ? { name: body.name.trim() } : {}),
        ...(planUpdate ?? {}),
        ...(typeof body.isActive === "boolean" ? { isActive: body.isActive } : {}),
        ...(typeof body.trialDays === "number" ? { trialDays: body.trialDays } : {}),
        ...(body.trialExpiresAt !== undefined ? { trialExpiresAt: body.trialExpiresAt ? new Date(`${body.trialExpiresAt}T12:00:00`) : null } : {}),
        ...(body.expiresAt !== undefined ? { expiresAt: body.expiresAt ? new Date(`${body.expiresAt}T12:00:00`) : null } : {})
      }
    });

    await logAdminAudit({
      actorUserId: admin.id,
      actorTenantId: admin.tenantId,
      targetTenantId: id,
      action: "tenant.updated",
      entityType: "tenant",
      entityId: id,
      summary: `Conta atualizada: ${id}`,
      metadata: {
        changed: Object.keys(body).filter((key) => body[key as keyof typeof body] !== undefined)
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Forbidden")) {
      return NextResponse.json({ message: error.message }, { status: error.message === "Forbidden" ? 403 : 401 });
    }

    return NextResponse.json({ message: "Failed to update tenant" }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: Params) {
  try {
    const admin = await requireAdminUser();
    const { id } = await context.params;

    if (!admin.isPlatformAdmin) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    if (id === admin.tenantId) {
      return NextResponse.json(
        { message: "A conta principal do superadmin não pode ser excluída por este fluxo" },
        { status: 400 }
      );
    }

    const target = await getDeletableTenant(id);

    if (!target) {
      return NextResponse.json({ message: "Conta não encontrada" }, { status: 404 });
    }

    const deleted = await deleteTenantWithAllData({ tenantId: id });

    await logAdminAudit({
      actorUserId: admin.id,
      actorTenantId: admin.tenantId,
      action: "tenant.deleted",
      entityType: "tenant",
      entityId: deleted.id,
      summary: `Conta removida definitivamente: ${deleted.name}`,
      metadata: {
        deletedTenantId: deleted.id,
        deletedTenantName: deleted.name,
        deletedTenantSlug: deleted.slug,
        totalUsers: deleted.totalUsers,
        activeUsers: deleted.activeUsers
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Forbidden")) {
      return NextResponse.json({ message: error.message }, { status: error.message === "Forbidden" ? 403 : 401 });
    }

    if (error instanceof Error) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    return NextResponse.json({ message: "Falha ao excluir conta" }, { status: 400 });
  }
}
