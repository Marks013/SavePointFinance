import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { logAdminAudit } from "@/lib/admin/audit";
import { requireAdminUser } from "@/lib/auth/admin";
import { revalidateAdminUsers } from "@/lib/cache/admin-read-models";
import { getTenantSeatSummary } from "@/lib/licensing/server";
import { prisma } from "@/lib/prisma/client";
import { deleteUserWithAllData, getDeletableUser } from "@/lib/users/delete-user";
import { assessUserReassignment, buildReassignmentBlockReason } from "@/lib/users/reassign-user";

const adminUserUpdateSchema = z.object({
  isActive: z.boolean().optional(),
  role: z.enum(["admin", "member"]).optional(),
  newPassword: z.string().min(8, "Minimo de 8 caracteres").optional(),
  tenantId: z.string().min(1).optional()
});

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: Params) {
  try {
    const admin = await requireAdminUser();
    const { id } = await context.params;
    const body = adminUserUpdateSchema.parse(await request.json());

    const data: {
      isActive?: boolean;
      role?: "admin" | "member";
      passwordHash?: string;
      tenantId?: string;
    } = {};

    if (typeof body.isActive === "boolean") data.isActive = body.isActive;

    if (body.role) {
      if (!admin.isPlatformAdmin) {
        return NextResponse.json(
          { message: "Somente o superadmin pode alterar o perfil entre Admin de Conta e Familiar" },
          { status: 403 }
        );
      }

      data.role = body.role;
    }

    if (admin.id === id && body.isActive === false) {
      return NextResponse.json({ message: "Voce nao pode desativar sua propria conta" }, { status: 400 });
    }

    const target = await prisma.user.findFirst({
      where: {
        id,
        ...(admin.isPlatformAdmin ? {} : { tenantId: admin.tenantId })
      },
      select: {
        id: true,
        tenantId: true,
        isPlatformAdmin: true,
        isActive: true
      }
    });

    if (!target) {
      return NextResponse.json({ message: "Usuario nao encontrado" }, { status: 404 });
    }

    if (target.isPlatformAdmin && admin.id !== target.id) {
      return NextResponse.json({ message: "Somente o superadmin pode alterar esta conta" }, { status: 403 });
    }

    if (body.newPassword) {
      if (admin.isPlatformAdmin) {
        return NextResponse.json(
          { message: "O superadmin deve usar o fluxo de link de redefinição, sem definir senhas manualmente" },
          { status: 403 }
        );
      }

      data.passwordHash = await hash(body.newPassword, 10);
    }

    if (body.tenantId) {
      if (!admin.isPlatformAdmin) {
        return NextResponse.json({ message: "Somente o superadmin pode mover pessoas entre contas" }, { status: 403 });
      }

      if (body.tenantId !== target.tenantId) {
        const reassignment = await assessUserReassignment(target.id);

        if (reassignment) {
          const blockReason = buildReassignmentBlockReason(reassignment);

          if (blockReason) {
            return NextResponse.json({ message: blockReason }, { status: 409 });
          }
        }
      }

      const nextTenant = await prisma.tenant.findUnique({
        where: { id: body.tenantId },
        select: {
          id: true,
          isActive: true,
          trialExpiresAt: true,
          expiresAt: true,
          planConfig: {
            select: {
              id: true,
              name: true,
              slug: true,
              tier: true,
              maxAccounts: true,
              maxCards: true,
              whatsappAssistant: true,
              automation: true,
              pdfExport: true,
              trialDays: true,
              isActive: true
            }
          }
        }
      });

      if (!nextTenant) {
        return NextResponse.json({ message: "Conta de destino não encontrada" }, { status: 404 });
      }

      if (body.tenantId !== target.tenantId) {
        const seatSummary = await getTenantSeatSummary(body.tenantId);

        if (!seatSummary?.license.canAccessApp) {
          return NextResponse.json({ message: "A conta de destino está indisponível" }, { status: 403 });
        }

        data.tenantId = body.tenantId;
      }
    }

    if (body.isActive === true || (body.tenantId && body.tenantId !== target.tenantId && target.isActive)) {
      const seatSummary = await getTenantSeatSummary(data.tenantId ?? target.tenantId);

      if (!admin.isPlatformAdmin && !seatSummary?.license.canAccessApp) {
        return NextResponse.json({ message: "Licença indisponível para ativar usuários" }, { status: 403 });
      }
    }

    await prisma.user.update({
      where: { id: target.id },
      data
    });

    await logAdminAudit({
      actorUserId: admin.id,
      actorTenantId: admin.tenantId,
      targetUserId: target.id,
      targetTenantId: data.tenantId ?? target.tenantId,
      action: "user.updated",
      entityType: "user",
      entityId: target.id,
      summary: `Usuário atualizado: ${target.id}`,
      metadata: {
        changed: Object.keys(data)
      }
    });

    revalidateAdminUsers(target.tenantId);
    revalidateAdminUsers(data.tenantId ?? target.tenantId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Forbidden")) {
      return NextResponse.json({ message: error.message }, { status: error.message === "Forbidden" ? 403 : 401 });
    }

    return NextResponse.json({ message: "Failed to update user" }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: Params) {
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
        tenantId: true
      }
    });

    if (!target) {
      return NextResponse.json({ message: "Usuário não encontrado" }, { status: 404 });
    }

    await getDeletableUser(target.id);

    const deleted = await deleteUserWithAllData({ userId: target.id });

    await logAdminAudit({
      actorUserId: admin.id,
      actorTenantId: admin.tenantId,
      targetTenantId: deleted.tenantId,
      action: "user.deleted",
      entityType: "user",
      entityId: deleted.id,
      summary: `Usuário removido definitivamente: ${deleted.email}`,
      metadata: {
        email: deleted.email,
        name: deleted.name
      }
    });

    revalidateAdminUsers(target.tenantId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Unauthorized" || error.message === "Forbidden") {
        return NextResponse.json({ message: error.message }, { status: error.message === "Forbidden" ? 403 : 401 });
      }

      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    return NextResponse.json({ message: "Falha ao excluir usuário" }, { status: 400 });
  }
}
