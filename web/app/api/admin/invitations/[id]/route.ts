import { NextResponse } from "next/server";
import { InvitationKind, NotificationChannel } from "@prisma/client";

import { logAdminAudit } from "@/lib/admin/audit";
import { requireAdminUser } from "@/lib/auth/admin";
import { deliverNotification } from "@/lib/notifications/delivery";
import { buildInvitationMessage } from "@/lib/notifications/invitation";
import { prisma } from "@/lib/prisma/client";
import { buildInvitationPath, createInvitationToken } from "@/lib/security/invitation-token";

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

export async function POST(_request: Request, context: Params) {
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
        name: true,
        role: true,
        tenantId: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        tenant: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    if (!target) {
      return NextResponse.json({ message: "Convite nao encontrado" }, { status: 404 });
    }

    if (target.acceptedAt) {
      return NextResponse.json({ message: "Este convite ja foi aceito" }, { status: 409 });
    }

    if (target.revokedAt) {
      return NextResponse.json({ message: "Este convite foi revogado" }, { status: 409 });
    }

    if (target.expiresAt <= new Date()) {
      return NextResponse.json({ message: "Este convite expirou e precisa ser recriado" }, { status: 409 });
    }

    const { rawToken, hashedToken } = createInvitationToken();

    await prisma.invitation.update({
      where: {
        id: target.id
      },
      data: {
        token: hashedToken
      }
    });

    const invitationMessage = buildInvitationMessage(rawToken, target.tenant.name, target.name, "admin_isolated");
    const delivery = await deliverNotification({
      tenantId: target.tenant.id,
      channel: NotificationChannel.email,
      target: target.email,
      subject: invitationMessage.subject,
      message: invitationMessage.message,
      html: invitationMessage.html
    });

    await logAdminAudit({
      actorUserId: admin.id,
      actorTenantId: admin.tenantId,
      targetTenantId: target.tenant.id,
      action: "invitation.resent",
      entityType: "invitation",
      entityId: target.id,
      summary: `Convite reenviado para ${target.email}`
    });

    return NextResponse.json({
      success: true,
      inviteUrl: buildInvitationPath(rawToken),
      emailDelivery: {
        status: delivery.status,
        errorMessage: delivery.errorMessage,
        attemptedAt: delivery.attemptedAt?.toISOString() ?? null
      }
    });
  } catch (error) {
    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Forbidden")) {
      return NextResponse.json({ message: error.message }, { status: error.message === "Forbidden" ? 403 : 401 });
    }

    return NextResponse.json({ message: "Failed to resend invitation" }, { status: 400 });
  }
}
