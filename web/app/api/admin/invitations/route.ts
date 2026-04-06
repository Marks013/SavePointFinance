import { NotificationChannel } from "@prisma/client";
import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { invitationSchema, type InvitationValues } from "@/features/password/schemas/password-schema";
import { logAdminAudit } from "@/lib/admin/audit";
import { requireAdminUser } from "@/lib/auth/admin";
import { normalizeEmail } from "@/lib/auth/normalize-email";
import { getTenantSeatSummary } from "@/lib/licensing/server";
import { deliverNotification } from "@/lib/notifications/delivery";
import { buildInvitationMessage } from "@/lib/notifications/invitation";
import { prisma } from "@/lib/prisma/client";

export async function GET(request: Request) {
  try {
    const admin = await requireAdminUser();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim();
    const tenantId = searchParams.get("tenantId")?.trim();

    const invitations = await prisma.invitation.findMany({
      where: {
        ...(admin.isPlatformAdmin ? (tenantId ? { tenantId } : {}) : { tenantId: admin.tenantId }),
        ...(search
          ? {
              OR: [
                { email: { contains: search, mode: "insensitive" } },
                { name: { contains: search, mode: "insensitive" } }
              ]
            }
          : {})
      },
      include: {
        invitedBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 100
    });

    return NextResponse.json({
      items: invitations.map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
        name: invitation.name,
        role: invitation.role,
        inviteUrl: `/accept-invitation?token=${invitation.token}`,
        expiresAt: invitation.expiresAt.toISOString(),
        acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
        revokedAt: invitation.revokedAt?.toISOString() ?? null,
        invitedBy: invitation.invitedBy
      }))
    });
  } catch (error) {
    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Forbidden")) {
      return NextResponse.json({ message: error.message }, { status: error.message === "Forbidden" ? 403 : 401 });
    }

    return NextResponse.json({ message: "Failed to load invitations" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdminUser();
    const payload = (await request.json()) as InvitationValues & { tenantId?: string };
    const body = invitationSchema.parse(payload);
    const normalizedEmail = normalizeEmail(body.email);
    const targetTenantId =
      admin.isPlatformAdmin && payload.tenantId ? payload.tenantId.trim() : admin.tenantId;
    const seatSummary = await getTenantSeatSummary(targetTenantId);

    if (!admin.isPlatformAdmin && !seatSummary?.license.canAccessApp) {
      return NextResponse.json({ message: "Licença indisponível para convidar usuários" }, { status: 403 });
    }

    if (!admin.isPlatformAdmin && seatSummary && seatSummary.remainingSeats !== null && seatSummary.remainingSeats <= 0) {
      return NextResponse.json(
        { message: "O limite de usuários do plano atual já foi atingido" },
        { status: 409 }
      );
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        email: {
          equals: normalizedEmail,
          mode: "insensitive"
        }
      }
    });

    if (existingUser) {
      return NextResponse.json({ message: "Ja existe um usuario com este e-mail" }, { status: 409 });
    }

    const activeInvitation = await prisma.invitation.findFirst({
      where: {
        tenantId: targetTenantId,
        email: {
          equals: normalizedEmail,
          mode: "insensitive"
        },
        acceptedAt: null,
        revokedAt: null,
        expiresAt: {
          gt: new Date()
        }
      }
    });

    if (activeInvitation) {
      return NextResponse.json({ message: "Ja existe um convite ativo para este e-mail" }, { status: 409 });
    }

    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invitation = await prisma.invitation.create({
      data: {
        tenantId: targetTenantId,
        invitedByUserId: admin.id,
        email: normalizedEmail,
        name: body.name,
        role: body.role,
        token,
        expiresAt
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    const invitationMessage = buildInvitationMessage(token, invitation.tenant.name, invitation.name);
    const delivery = await deliverNotification({
      tenantId: invitation.tenant.id,
      channel: NotificationChannel.email,
      target: invitation.email,
      subject: invitationMessage.subject,
      message: invitationMessage.message
    });

    await logAdminAudit({
      actorUserId: admin.id,
      actorTenantId: admin.tenantId,
      targetTenantId,
      action: "invitation.created",
      entityType: "invitation",
      entityId: invitation.id,
      summary: `Convite criado para ${invitation.email}`,
      metadata: {
        role: invitation.role
      }
    });

    return NextResponse.json(
      {
        id: invitation.id,
        email: invitation.email,
        name: invitation.name,
        role: invitation.role,
        inviteUrl: `/accept-invitation?token=${invitation.token}`,
        expiresAt: invitation.expiresAt.toISOString(),
        emailDelivery: {
          status: delivery.status,
          errorMessage: delivery.errorMessage,
          attemptedAt: delivery.attemptedAt?.toISOString() ?? null
        }
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Forbidden")) {
      return NextResponse.json({ message: error.message }, { status: error.message === "Forbidden" ? 403 : 401 });
    }

    return NextResponse.json({ message: "Failed to create invitation" }, { status: 400 });
  }
}
