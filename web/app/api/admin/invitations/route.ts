import { InvitationKind, NotificationChannel } from "@prisma/client";
import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { invitationSchema, type InvitationValues } from "@/features/password/schemas/password-schema";
import { logAdminAudit } from "@/lib/admin/audit";
import { requireAdminUser } from "@/lib/auth/admin";
import { normalizeEmail } from "@/lib/auth/normalize-email";
import { ensureTenantDefaultCategories } from "@/lib/finance/default-categories";
import { applyPlanDefaultsToTenant, ensureDefaultPlans } from "@/lib/licensing/default-plans";
import { deliverNotification } from "@/lib/notifications/delivery";
import { buildInvitationMessage } from "@/lib/notifications/invitation";
import { prisma } from "@/lib/prisma/client";
import { assessUserReassignment, buildReassignmentBlockReason } from "@/lib/users/reassign-user";

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

async function buildUniqueTenantSlug(email: string) {
  const baseSlug = slugify(email.split("@")[0] ?? "usuario") || "usuario";

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const suffix = crypto.randomBytes(3).toString("hex");
    const slug = `${baseSlug}-${suffix}`;
    const existing = await prisma.tenant.findUnique({
      where: {
        slug
      },
      select: {
        id: true
      }
    });

    if (!existing) {
      return slug;
    }
  }

  return `${baseSlug}-${Date.now().toString(36)}`;
}

export async function GET(request: Request) {
  try {
    const admin = await requireAdminUser();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim();
    const tenantId = searchParams.get("tenantId")?.trim();

    const invitations = await prisma.invitation.findMany({
      where: {
        kind: InvitationKind.admin_isolated,
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
        kind: invitation.kind,
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

    if (!admin.isPlatformAdmin) {
      return NextResponse.json(
        { message: "Use Compartilhamento para convidar alguem para a sua carteira" },
        { status: 403 }
      );
    }

    const payload = (await request.json()) as InvitationValues & { planId?: string };
    const body = invitationSchema.parse(payload);
    const normalizedEmail = normalizeEmail(body.email);

    const existingUser = await prisma.user.findFirst({
      where: {
        email: {
          equals: normalizedEmail,
          mode: "insensitive"
        }
      }
    });

    if (existingUser) {
      const reassignment = await assessUserReassignment(existingUser.id);
      const blockReason = reassignment ? buildReassignmentBlockReason(reassignment) : null;

      if (blockReason) {
        return NextResponse.json({ message: blockReason }, { status: 409 });
      }
    }

    const activeInvitation = await prisma.invitation.findFirst({
      where: {
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

    const requestedPlanId = payload.planId?.trim();

    if (!requestedPlanId) {
      return NextResponse.json({ message: "Selecione o plano inicial do usuario" }, { status: 400 });
    }

    await ensureDefaultPlans(prisma);
    const plan = await prisma.plan.findFirst({
      where: {
        id: requestedPlanId,
        isActive: true
      }
    });

    if (!plan) {
      return NextResponse.json({ message: "Nenhum plano ativo foi encontrado" }, { status: 400 });
    }

    const targetTenant = await prisma.tenant.create({
      data: {
        name: `${body.name} - carteira`,
        slug: await buildUniqueTenantSlug(normalizedEmail),
        ...applyPlanDefaultsToTenant(plan),
        isActive: true,
        expiresAt: null
      }
    });

    await ensureTenantDefaultCategories(targetTenant.id);

    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invitation = await prisma.invitation.create({
      data: {
        tenantId: targetTenant.id,
        invitedByUserId: admin.id,
        email: normalizedEmail,
        name: body.name,
        role: body.role,
        kind: InvitationKind.admin_isolated,
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
      message: invitationMessage.message,
      html: invitationMessage.html
    });

    await logAdminAudit({
      actorUserId: admin.id,
      actorTenantId: admin.tenantId,
      targetTenantId: targetTenant.id,
      action: "invitation.created",
      entityType: "invitation",
      entityId: invitation.id,
      summary: `Convite isolado criado para ${invitation.email}`,
      metadata: {
        role: invitation.role,
        existingUserLinked: Boolean(existingUser),
        mode: "isolated_wallet",
        planId: plan.id
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
