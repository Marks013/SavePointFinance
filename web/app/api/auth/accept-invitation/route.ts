import { InvitationKind } from "@prisma/client";
import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { acceptInvitationSchema } from "@/features/password/schemas/password-schema";
import { logAdminAudit } from "@/lib/admin/audit";
import { normalizeEmail } from "@/lib/auth/normalize-email";
import { revalidateAdminUsers } from "@/lib/cache/admin-read-models";
import { PRIVACY_POLICY_VERSION, TERMS_OF_USE_VERSION } from "@/lib/legal/documents";
import { getTenantSeatSummary } from "@/lib/licensing/server";
import { captureRequestError } from "@/lib/observability/sentry";
import { prisma } from "@/lib/prisma/client";
import { assessUserReassignment, buildReassignmentBlockReason } from "@/lib/users/reassign-user";

async function tenantHasFinancialData(tenantId: string) {
  const [accounts, cards, transactions, goals, subscriptions, statementPayments] = await Promise.all([
    prisma.financialAccount.count({ where: { tenantId } }),
    prisma.card.count({ where: { tenantId } }),
    prisma.transaction.count({ where: { tenantId } }),
    prisma.goal.count({ where: { tenantId } }),
    prisma.subscription.count({ where: { tenantId } }),
    prisma.statementPayment.count({ where: { tenantId } })
  ]);

  return accounts + cards + transactions + goals + subscriptions + statementPayments > 0;
}

export async function POST(request: Request) {
  try {
    const body = acceptInvitationSchema.parse(await request.json());

    const invitation = await prisma.invitation.findUnique({
      where: {
        token: body.token
      }
    });

    if (!invitation || invitation.revokedAt || invitation.acceptedAt || invitation.expiresAt < new Date()) {
      return NextResponse.json({ message: "Convite invalido ou expirado" }, { status: 400 });
    }

    const seatSummary = await getTenantSeatSummary(invitation.tenantId);

    if (!seatSummary?.license.canAccessApp) {
      return NextResponse.json({ message: "A conta está com a licença indisponível" }, { status: 403 });
    }

    if (invitation.kind !== InvitationKind.shared_wallet && await tenantHasFinancialData(invitation.tenantId)) {
      return NextResponse.json(
        { message: "Este convite administrativo aponta para uma carteira com dados financeiros. Gere um novo convite isolado pelo Admin." },
        { status: 409 }
      );
    }

    const normalizedEmail = normalizeEmail(invitation.email);
    const passwordHash = await hash(body.password, 10);
    const invitationRole = invitation.kind === InvitationKind.shared_wallet ? "member" : "admin";

    const existingUser = await prisma.user.findFirst({
      where: {
        email: {
          equals: normalizedEmail,
          mode: "insensitive"
        }
      }
    });

    if (existingUser) {
      if (existingUser.tenantId === invitation.tenantId) {
        return NextResponse.json({ message: "Esta pessoa já participa desta conta" }, { status: 409 });
      }

      const reassignment = await assessUserReassignment(existingUser.id);
      const blockReason = reassignment ? buildReassignmentBlockReason(reassignment) : null;

      if (blockReason) {
        return NextResponse.json({ message: blockReason }, { status: 409 });
      }

      const updatedUser = await prisma.user.update({
        where: {
          id: existingUser.id
        },
        data: {
          tenantId: invitation.tenantId,
          name: body.name,
          passwordHash,
          role: invitationRole,
          isActive: true
        }
      });

      await prisma.invitation.update({
        where: {
          id: invitation.id
        },
        data: {
          acceptedAt: new Date(),
          name: body.name,
          role: invitationRole
        }
      });

      await logAdminAudit({
        actorUserId: updatedUser.id,
        actorTenantId: updatedUser.tenantId,
        targetUserId: updatedUser.id,
        targetTenantId: updatedUser.tenantId,
        action: "auth.invitation_accepted",
        entityType: "invitation",
        entityId: invitation.id,
        summary: `Convite aceito por ${updatedUser.email}`,
        metadata: {
          invitationKind: invitation.kind,
          acceptedTermsOfUseVersion: TERMS_OF_USE_VERSION,
          acceptedPrivacyPolicyVersion: PRIVACY_POLICY_VERSION,
          acceptedAt: new Date().toISOString()
        }
      });

      revalidateAdminUsers(invitation.tenantId);
      revalidateAdminUsers(existingUser.tenantId);

      return NextResponse.json({
        success: true,
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          linkedExistingAccount: true
        }
      });
    }

    const user = await prisma.user.create({
      data: {
        tenantId: invitation.tenantId,
        email: normalizedEmail,
        name: body.name,
        passwordHash,
        role: invitationRole,
        isActive: true,
        preferences: {
          create: {
            autoTithe: false
          }
        }
      }
    });

    await prisma.invitation.update({
      where: {
        id: invitation.id
      },
        data: {
          acceptedAt: new Date(),
          name: body.name,
          role: invitationRole
        }
      });

    await logAdminAudit({
      actorUserId: user.id,
      actorTenantId: user.tenantId,
      targetUserId: user.id,
      targetTenantId: user.tenantId,
      action: "auth.invitation_accepted",
      entityType: "invitation",
      entityId: invitation.id,
      summary: `Convite aceito por ${user.email}`,
      metadata: {
        invitationKind: invitation.kind,
        acceptedTermsOfUseVersion: TERMS_OF_USE_VERSION,
        acceptedPrivacyPolicyVersion: PRIVACY_POLICY_VERSION,
        acceptedAt: new Date().toISOString()
      }
    });

    revalidateAdminUsers(invitation.tenantId);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
    }

    captureRequestError(error, { request, feature: "auth-invitation" });
    return NextResponse.json({ message: "Failed to accept invitation" }, { status: 400 });
  }
}
