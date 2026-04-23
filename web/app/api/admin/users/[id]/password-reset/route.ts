import { NextResponse } from "next/server";

import { logAdminAudit } from "@/lib/admin/audit";
import { requireAdminUser } from "@/lib/auth/admin";
import { issuePasswordResetForUser } from "@/lib/auth/password-reset";
import { prisma } from "@/lib/prisma/client";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: Params) {
  try {
    const admin = await requireAdminUser();
    const { id } = await context.params;

    const target = await prisma.user.findFirst({
      where: {
        id,
        ...(admin.isPlatformAdmin ? {} : { tenantId: admin.tenantId })
      },
      select: {
        id: true,
        tenantId: true,
        email: true,
        name: true,
        isPlatformAdmin: true
      }
    });

    if (!target) {
      return NextResponse.json({ message: "Usuário não encontrado" }, { status: 404 });
    }

    if (target.isPlatformAdmin && admin.id !== target.id) {
      return NextResponse.json({ message: "Somente o próprio superadmin pode redefinir esta senha" }, { status: 403 });
    }

    const result = await issuePasswordResetForUser(target);

    await logAdminAudit({
      actorUserId: admin.id,
      actorTenantId: admin.tenantId,
      targetUserId: target.id,
      targetTenantId: target.tenantId,
      action: "user.password_reset.requested",
      entityType: "user",
      entityId: target.id,
      summary: `Link de redefinição de senha enviado para ${target.email}`,
      metadata: {
        expiresAt: result.expiresAt.toISOString(),
        requestedByPlatformAdmin: admin.isPlatformAdmin
      }
    });

    return NextResponse.json({
      success: true,
      message: "Link de redefinição enviado para o e-mail do usuário"
    });
  } catch (error) {
    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Forbidden")) {
      return NextResponse.json({ message: error.message }, { status: error.message === "Forbidden" ? 403 : 401 });
    }

    return NextResponse.json({ message: "Falha ao iniciar redefinição de senha" }, { status: 400 });
  }
}
