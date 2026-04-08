import crypto from "node:crypto";
import { InvitationKind, NotificationChannel } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { logAdminAudit } from "@/lib/admin/audit";
import { requireSessionUser } from "@/lib/auth/session";
import { normalizeEmail } from "@/lib/auth/normalize-email";
import { getTenantSeatSummary } from "@/lib/licensing/server";
import { deliverNotification } from "@/lib/notifications/delivery";
import { buildInvitationMessage } from "@/lib/notifications/invitation";
import { prisma } from "@/lib/prisma/client";
import { getSharingAuthority } from "@/lib/sharing/access";

const sharingInviteSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome"),
  email: z.string().trim().email("Informe um e-mail valido")
});

async function getFamilySharingInvitations(ownerUserId: string | undefined, tenantId: string) {
  if (!ownerUserId) {
    return [];
  }

  return prisma.invitation.findMany({
    where: {
      tenantId,
      invitedByUserId: ownerUserId,
      kind: InvitationKind.shared_wallet
    },
    orderBy: {
      createdAt: "desc"
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      token: true
    }
  });
}

function getActiveFamilyInvitationEmails(invitations: Awaited<ReturnType<typeof getFamilySharingInvitations>>) {
  return invitations.flatMap((invitation) => (invitation.acceptedAt && !invitation.revokedAt ? [invitation.email] : []));
}

export async function GET() {
  try {
    const user = await requireSessionUser();
    const authority = await getSharingAuthority(user);
    const invitations = await getFamilySharingInvitations(authority.primaryAdmin?.id, user.tenantId);
    const activeFamilyEmails = getActiveFamilyInvitationEmails(invitations);
    const members = activeFamilyEmails.length
      ? await prisma.user.findMany({
          where: {
            tenantId: user.tenantId,
            email: {
              in: activeFamilyEmails
            },
            isPlatformAdmin: false
          },
          orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            createdAt: true,
            lastLogin: true
          }
        })
      : [];

    return NextResponse.json({
      canManage: authority.canManage,
      owner: authority.primaryAdmin,
      members: members.map((member) => ({
        id: member.id,
        name: member.name,
        email: member.email,
        role: member.role,
        isActive: member.isActive,
        createdAt: member.createdAt.toISOString(),
        lastLogin: member.lastLogin?.toISOString() ?? null
      })),
      invitations: invitations.map((invitation) => ({
        id: invitation.id,
        name: invitation.name,
        email: invitation.email,
        role: invitation.role,
        inviteUrl: `/accept-invitation?token=${invitation.token}`,
        expiresAt: invitation.expiresAt.toISOString(),
        acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
        revokedAt: invitation.revokedAt?.toISOString() ?? null
      }))
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ message: "Failed to load sharing state" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const authority = await getSharingAuthority(user);

    if (!authority.canManage || !authority.primaryAdmin) {
      return NextResponse.json({ message: "Somente o titular da conta pode gerenciar este compartilhamento" }, { status: 403 });
    }

    const seatSummary = await getTenantSeatSummary(user.tenantId);
    if (!seatSummary?.license.canAccessApp) {
      return NextResponse.json({ message: "Licenca indisponivel para compartilhar a carteira" }, { status: 403 });
    }

    const familyInvitations = await getFamilySharingInvitations(authority.primaryAdmin.id, user.tenantId);
    const activeFamilyEmails = getActiveFamilyInvitationEmails(familyInvitations);
    const activeMembersCount = activeFamilyEmails.length
      ? await prisma.user.count({
          where: {
            tenantId: user.tenantId,
            email: {
              in: activeFamilyEmails
            },
            isPlatformAdmin: false,
            isActive: true
          }
        })
      : 0;

    const now = new Date();
    const activeInvitationsCount = familyInvitations.filter(
      (invitation) => !invitation.acceptedAt && !invitation.revokedAt && invitation.expiresAt > now
    ).length;

    if (activeMembersCount > 0 || activeInvitationsCount > 0) {
      return NextResponse.json(
        { message: "Esta carteira ja possui um compartilhamento ativo ou um convite pendente" },
        { status: 409 }
      );
    }

    const body = sharingInviteSchema.parse(await request.json());
    const normalizedEmail = normalizeEmail(body.email);
    const existingUser = await prisma.user.findFirst({
      where: {
        email: {
          equals: normalizedEmail,
          mode: "insensitive"
        }
      },
      select: {
        id: true,
        tenantId: true
      }
    });

    if (existingUser?.tenantId === user.tenantId) {
      return NextResponse.json({ message: "Esta pessoa ja faz parte desta carteira" }, { status: 409 });
    }

    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invitation = await prisma.invitation.create({
      data: {
        tenantId: user.tenantId,
        invitedByUserId: authority.primaryAdmin.id,
        email: normalizedEmail,
        name: body.name,
        role: "member",
        kind: InvitationKind.shared_wallet,
        token,
        expiresAt
      }
    });

    const invitationMessage = buildInvitationMessage(token, user.tenant.name, body.name);
    const delivery = await deliverNotification({
      tenantId: user.tenantId,
      channel: NotificationChannel.email,
      target: normalizedEmail,
      subject: invitationMessage.subject,
      message: invitationMessage.message,
      html: invitationMessage.html
    });

    await logAdminAudit({
      actorUserId: user.id,
      actorTenantId: user.tenantId,
      targetTenantId: user.tenantId,
      action: "sharing.invitation.created",
      entityType: "invitation",
      entityId: invitation.id,
      summary: `Convite de compartilhamento criado para ${normalizedEmail}`,
      metadata: {
        mode: "shared_wallet"
      }
    });

    return NextResponse.json(
      {
        id: invitation.id,
        inviteUrl: `/accept-invitation?token=${invitation.token}`,
        emailDelivery: {
          status: delivery.status,
          errorMessage: delivery.errorMessage,
          attemptedAt: delivery.attemptedAt?.toISOString() ?? null
        }
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: error.issues[0]?.message ?? "Dados invalidos" }, { status: 400 });
    }

    return NextResponse.json({ message: "Failed to create sharing invitation" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireSessionUser();
    const authority = await getSharingAuthority(user);

    if (!authority.canManage || !authority.primaryAdmin) {
      return NextResponse.json({ message: "Somente o titular da conta pode gerenciar este compartilhamento" }, { status: 403 });
    }

    const body = (await request.json()) as { invitationId?: string; memberId?: string };
    const familyInvitations = await getFamilySharingInvitations(authority.primaryAdmin.id, user.tenantId);
    const familyInvitationIds = new Set(familyInvitations.map((invitation) => invitation.id));

    if (body.invitationId) {
      if (!familyInvitationIds.has(body.invitationId)) {
        return NextResponse.json({ message: "Convite nao encontrado" }, { status: 404 });
      }

      const invitation = await prisma.invitation.findFirst({
        where: {
          id: body.invitationId,
          tenantId: user.tenantId,
          kind: InvitationKind.shared_wallet
        },
        select: {
          id: true,
          email: true,
          acceptedAt: true,
          revokedAt: true
        }
      });

      if (!invitation) {
        return NextResponse.json({ message: "Convite nao encontrado" }, { status: 404 });
      }

      if (!invitation.acceptedAt && !invitation.revokedAt) {
        await prisma.invitation.update({
          where: {
            id: invitation.id
          },
          data: {
            revokedAt: new Date()
          }
        });
      }

      return NextResponse.json({ success: true });
    }

    if (body.memberId) {
      const activeFamilyEmails = new Set(getActiveFamilyInvitationEmails(familyInvitations));
      const member = await prisma.user.findFirst({
        where: {
          tenantId: user.tenantId,
          id: body.memberId,
          isPlatformAdmin: false
        },
        select: {
          id: true,
          email: true,
          isActive: true
        }
      });

      if (!member || !activeFamilyEmails.has(member.email)) {
        return NextResponse.json({ message: "Pessoa convidada nao encontrada" }, { status: 404 });
      }

      await prisma.user.update({
        where: {
          id: member.id
        },
        data: {
          isActive: false,
          role: "member"
        }
      });

      await logAdminAudit({
        actorUserId: user.id,
        actorTenantId: user.tenantId,
        targetUserId: member.id,
        targetTenantId: user.tenantId,
        action: "sharing.member.revoked",
        entityType: "user",
        entityId: member.id,
        summary: `Acesso compartilhado revogado para ${member.email}`,
        metadata: {
          mode: "shared_wallet"
        }
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ message: "Nenhum alvo informado" }, { status: 400 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ message: "Failed to update sharing access" }, { status: 400 });
  }
}
