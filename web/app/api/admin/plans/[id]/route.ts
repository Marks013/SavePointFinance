import { NextResponse } from "next/server";

import { logAdminAudit } from "@/lib/admin/audit";
import { requireAdminUser } from "@/lib/auth/admin";
import { prisma } from "@/lib/prisma/client";

type Params = {
  params: Promise<{ id: string }>;
};

function normalizeOptionalLimit(value: number | null | undefined) {
  if (typeof value !== "number") {
    return null;
  }

  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

export async function PATCH(request: Request, context: Params) {
  try {
    const admin = await requireAdminUser();

    if (!admin.isPlatformAdmin) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    const body = (await request.json()) as {
      name?: string;
      description?: string | null;
      tier?: "free" | "pro";
      maxAccounts?: number | null;
      maxCards?: number | null;
      trialDays?: number;
      whatsappAssistant?: boolean;
      automation?: boolean;
      pdfExport?: boolean;
      isActive?: boolean;
      sortOrder?: number;
    };

    const target = await prisma.plan.findUnique({
      where: {
        id
      },
      select: {
        id: true,
        name: true
      }
    });

    if (!target) {
      return NextResponse.json({ message: "Plano não encontrado" }, { status: 404 });
    }

    await prisma.plan.update({
      where: {
        id
      },
      data: {
        ...(body.name ? { name: body.name.trim() } : {}),
        ...(body.description !== undefined ? { description: body.description?.trim() || null } : {}),
        ...(body.tier ? { tier: body.tier } : {}),
        ...(body.maxAccounts !== undefined ? { maxAccounts: normalizeOptionalLimit(body.maxAccounts) } : {}),
        ...(body.maxCards !== undefined ? { maxCards: normalizeOptionalLimit(body.maxCards) } : {}),
        ...(typeof body.trialDays === "number" ? { trialDays: Math.max(0, body.trialDays) } : {}),
        ...(typeof body.whatsappAssistant === "boolean" ? { whatsappAssistant: body.whatsappAssistant } : {}),
        ...(typeof body.automation === "boolean" ? { automation: body.automation } : {}),
        ...(typeof body.pdfExport === "boolean" ? { pdfExport: body.pdfExport } : {}),
        ...(typeof body.isActive === "boolean" ? { isActive: body.isActive } : {}),
        ...(typeof body.sortOrder === "number" ? { sortOrder: body.sortOrder } : {})
      }
    });

    await logAdminAudit({
      actorUserId: admin.id,
      actorTenantId: admin.tenantId,
      action: "plan.updated",
      entityType: "plan",
      entityId: id,
      summary: `Plano atualizado: ${target.name}`,
      metadata: {
        changed: Object.keys(body).filter((key) => body[key as keyof typeof body] !== undefined)
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Forbidden")) {
      return NextResponse.json({ message: error.message }, { status: error.message === "Forbidden" ? 403 : 401 });
    }

    return NextResponse.json({ message: "Failed to update plan" }, { status: 400 });
  }
}

export async function DELETE(_: Request, context: Params) {
  try {
    const admin = await requireAdminUser();

    if (!admin.isPlatformAdmin) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    const target = await prisma.plan.findUnique({
      where: {
        id
      },
      include: {
        _count: {
          select: {
            tenants: true
          }
        }
      }
    });

    if (!target) {
      return NextResponse.json({ message: "Plano não encontrado" }, { status: 404 });
    }

    if (target.isDefault) {
      return NextResponse.json({ message: "Planos padrão não podem ser excluídos" }, { status: 403 });
    }

    if (target._count.tenants > 0) {
      return NextResponse.json({ message: "Remova ou migre as contas vinculadas antes de excluir o plano" }, { status: 409 });
    }

    await prisma.plan.delete({
      where: {
        id
      }
    });

    await logAdminAudit({
      actorUserId: admin.id,
      actorTenantId: admin.tenantId,
      action: "plan.deleted",
      entityType: "plan",
      entityId: id,
      summary: `Plano excluído: ${target.name}`
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Forbidden")) {
      return NextResponse.json({ message: error.message }, { status: error.message === "Forbidden" ? 403 : 401 });
    }

    return NextResponse.json({ message: "Failed to delete plan" }, { status: 400 });
  }
}
