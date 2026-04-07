import { NextResponse } from "next/server";
import { InvitationKind } from "@prisma/client";

import { logAdminAudit } from "@/lib/admin/audit";
import { requireAdminUser } from "@/lib/auth/admin";
import { prisma } from "@/lib/prisma/client";

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(_request: Request, context: Params) {
  try {
    const admin = await requireAdminUser();
    const { id } = await context.params;

    const target = await prisma.invitation.findFirst({
      where: {
        id,
        kind: InvitationKind.admin_isolated,
        ...(admin.isPlatformAdmin ? {} : { tenantId: admin.tenantId })
      },
      select: {
        id: true,
        email: true,
        tenantId: true,
        acceptedAt: true,
        revokedAt: true
      }
    });

    if (!target) {
      return NextResponse.json({ message: "Convite nao encontrado" }, { status: 404 });
    }

    if (target.acceptedAt || target.revokedAt) {
      return NextResponse.json({ success: true });
    }

    await prisma.invitation.updateMany({
      where: {
        id: target.id,
        tenantId: target.tenantId,
        kind: InvitationKind.admin_isolated,
        acceptedAt: null,
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });

    await logAdminAudit({
      actorUserId: admin.id,
      actorTenantId: admin.tenantId,
      targetTenantId: target.tenantId,
      action: "invitation.revoked",
      entityType: "invitation",
      entityId: target.id,
      summary: `Convite revogado para ${target.email}`
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Forbidden")) {
      return NextResponse.json({ message: error.message }, { status: error.message === "Forbidden" ? 403 : 401 });
    }

    return NextResponse.json({ message: "Failed to revoke invitation" }, { status: 400 });
  }
}
