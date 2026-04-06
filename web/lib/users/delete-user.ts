import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma/client";

type DeleteUserOptions = {
  userId: string;
};

type DeleteUserResult = {
  id: string;
  email: string;
  name: string;
  tenantId: string;
};

export async function getDeletableUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      tenantId: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      isPlatformAdmin: true,
      whatsappNumber: true
    }
  });

  if (!user) {
    return null;
  }

  if (user.isPlatformAdmin) {
    throw new Error("A conta superadmin da plataforma não pode ser excluída por este fluxo");
  }

  if (user.role === "admin" && user.isActive) {
    const otherActiveAdmins = await prisma.user.count({
      where: {
        tenantId: user.tenantId,
        role: "admin",
        isActive: true,
        id: {
          not: user.id
        }
      }
    });

    if (otherActiveAdmins === 0) {
      throw new Error("Esta carteira compartilhada precisa manter ao menos um administrador ativo.");
    }
  }

  return user;
}

export async function deleteUserWithAllData(options: DeleteUserOptions): Promise<DeleteUserResult> {
  const user = await getDeletableUser(options.userId);

  if (!user) {
    throw new Error("Usuário não encontrado");
  }

  await prisma.$transaction(async (tx) => {
    const [accounts, cards] = await Promise.all([
      tx.financialAccount.findMany({
        where: { ownerUserId: user.id },
        select: { id: true }
      }),
      tx.card.findMany({
        where: { ownerUserId: user.id },
        select: { id: true }
      })
    ]);

    const accountIds = accounts.map((item) => item.id);
    const cardIds = cards.map((item) => item.id);
    const targetMatches: Prisma.NotificationDeliveryWhereInput[] = [{ target: user.email }];

    if (user.whatsappNumber) {
      targetMatches.push({ target: user.whatsappNumber });
    }

    await tx.adminAuditLog.deleteMany({
      where: {
        OR: [{ actorUserId: user.id }, { targetUserId: user.id }]
      }
    });

    await tx.notificationDelivery.deleteMany({
      where: {
        OR: [{ userId: user.id }, ...targetMatches]
      }
    });

    await tx.invitation.deleteMany({
      where: {
        OR: [{ invitedByUserId: user.id }, { email: user.email }]
      }
    });

    await tx.whatsAppMessage.deleteMany({
      where: {
        userId: user.id
      }
    });

    await tx.goal.deleteMany({
      where: {
        OR: [
          { userId: user.id },
          ...(accountIds.length ? [{ accountId: { in: accountIds } }] : [])
        ]
      }
    });

    await tx.subscription.deleteMany({
      where: {
        OR: [
          { userId: user.id },
          ...(accountIds.length ? [{ accountId: { in: accountIds } }] : []),
          ...(cardIds.length ? [{ cardId: { in: cardIds } }] : [])
        ]
      }
    });

    await tx.transaction.deleteMany({
      where: {
        OR: [
          { userId: user.id },
          ...(accountIds.length
            ? [{ accountId: { in: accountIds } }, { destinationAccountId: { in: accountIds } }]
            : []),
          ...(cardIds.length ? [{ cardId: { in: cardIds } }] : [])
        ]
      }
    });

    if (accountIds.length || cardIds.length) {
      await tx.statementPayment.deleteMany({
        where: {
          OR: [
            ...(accountIds.length ? [{ accountId: { in: accountIds } }] : []),
            ...(cardIds.length ? [{ cardId: { in: cardIds } }] : [])
          ]
        }
      });
    }

    await tx.financialAccount.deleteMany({
      where: { ownerUserId: user.id }
    });

    await tx.card.deleteMany({
      where: { ownerUserId: user.id }
    });

    await tx.user.delete({
      where: { id: user.id }
    });
  });

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    tenantId: user.tenantId
  };
}
