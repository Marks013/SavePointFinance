import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { acceptInvitationSchema } from "@/features/password/schemas/password-schema";
import { normalizeEmail } from "@/lib/auth/normalize-email";
import { getTenantSeatSummary } from "@/lib/licensing/server";
import { prisma } from "@/lib/prisma/client";
import { assessUserReassignment, buildReassignmentBlockReason } from "@/lib/users/reassign-user";

async function isSharingInvitation(invitationId: string) {
  const audit = await prisma.adminAuditLog.findFirst({
    where: {
      action: "sharing.invitation.created",
      entityType: "invitation",
      entityId: invitationId
    },
    select: {
      id: true
    }
  });

  return Boolean(audit);
}

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

    if (!(await isSharingInvitation(invitation.id)) && await tenantHasFinancialData(invitation.tenantId)) {
      return NextResponse.json(
        { message: "Este convite administrativo aponta para uma carteira com dados financeiros. Gere um novo convite isolado pelo Admin." },
        { status: 409 }
      );
    }

    const normalizedEmail = normalizeEmail(invitation.email);
    const passwordHash = await hash(body.password, 10);

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
          role: invitation.role,
          isActive: true
        }
      });

      await prisma.invitation.update({
        where: {
          id: invitation.id
        },
        data: {
          acceptedAt: new Date(),
          name: body.name
        }
      });

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
        role: invitation.role,
        isActive: true,
        preferences: {
          create: {}
        }
      }
    });

    await prisma.invitation.update({
      where: {
        id: invitation.id
      },
      data: {
        acceptedAt: new Date(),
        name: body.name
      }
    });

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

    return NextResponse.json({ message: "Failed to accept invitation" }, { status: 400 });
  }
}
