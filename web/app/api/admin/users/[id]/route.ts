import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { logAdminAudit } from "@/lib/admin/audit";
import { requireAdminUser } from "@/lib/auth/admin";
import { getTenantSeatSummary } from "@/lib/licensing/server";
import { prisma } from "@/lib/prisma/client";

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
    if (body.role) data.role = body.role;
    if (body.newPassword) data.passwordHash = await hash(body.newPassword, 10);

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

    if (body.tenantId) {
      if (!admin.isPlatformAdmin) {
        return NextResponse.json({ message: "Somente o superadmin pode mover usuários entre organizações" }, { status: 403 });
      }

      const nextTenant = await prisma.tenant.findUnique({
        where: { id: body.tenantId },
        select: {
          id: true,
          plan: true,
          maxUsers: true,
          isActive: true,
          trialExpiresAt: true,
          expiresAt: true
        }
      });

      if (!nextTenant) {
        return NextResponse.json({ message: "Organização de destino não encontrada" }, { status: 404 });
      }

      if (body.tenantId !== target.tenantId) {
        const seatSummary = await getTenantSeatSummary(body.tenantId);

        if (!seatSummary?.license.canAccessApp) {
          return NextResponse.json({ message: "A organização de destino está indisponível" }, { status: 403 });
        }

        if (target.isActive && seatSummary.remainingSeats !== null && seatSummary.remainingSeats <= 0) {
          return NextResponse.json(
            { message: "O limite de usuários da organização de destino já foi atingido" },
            { status: 409 }
          );
        }

        data.tenantId = body.tenantId;
      }
    }

    if (body.isActive === true || (body.tenantId && body.tenantId !== target.tenantId && target.isActive)) {
      const seatSummary = await getTenantSeatSummary(data.tenantId ?? target.tenantId);

      if (!admin.isPlatformAdmin && !seatSummary?.license.canAccessApp) {
        return NextResponse.json({ message: "Licença indisponível para ativar usuários" }, { status: 403 });
      }

      if (!admin.isPlatformAdmin && seatSummary && seatSummary.remainingSeats !== null && seatSummary.remainingSeats <= 0) {
        return NextResponse.json(
          { message: "O limite de usuários do plano atual já foi atingido" },
          { status: 409 }
        );
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

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Forbidden")) {
      return NextResponse.json({ message: error.message }, { status: error.message === "Forbidden" ? 403 : 401 });
    }

    return NextResponse.json({ message: "Failed to update user" }, { status: 400 });
  }
}
