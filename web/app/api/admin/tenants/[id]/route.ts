import { NextResponse } from "next/server";

import { logAdminAudit } from "@/lib/admin/audit";
import { requireAdminUser } from "@/lib/auth/admin";
import { prisma } from "@/lib/prisma/client";

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: Params) {
  try {
    const admin = await requireAdminUser();
    const { id } = await context.params;
    const body = (await request.json()) as {
      name?: string;
      plan?: "free" | "pro";
      maxUsers?: number;
      isActive?: boolean;
      trialDays?: number;
      trialExpiresAt?: string | null;
      expiresAt?: string | null;
    };

    if (!admin.isPlatformAdmin && id !== admin.tenantId) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    await prisma.tenant.update({
      where: {
        id
      },
      data: {
        ...(body.name ? { name: body.name.trim() } : {}),
        ...(body.plan ? { plan: body.plan } : {}),
        ...(typeof body.maxUsers === "number" ? { maxUsers: body.maxUsers } : {}),
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
      summary: `Organização atualizada: ${id}`,
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
