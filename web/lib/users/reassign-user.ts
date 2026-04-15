import { prisma } from "@/lib/prisma/client";

export type UserReassignmentAssessment = {
  userId: string;
  currentTenantId: string;
  hasOwnData: boolean;
  isLastActiveAdmin: boolean;
  counts: {
    accounts: number;
    cards: number;
    transactions: number;
    goals: number;
    subscriptions: number;
  };
};

export async function assessUserReassignment(userId: string): Promise<UserReassignmentAssessment | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      tenantId: true,
      role: true,
      isActive: true
    }
  });

  if (!user) {
    return null;
  }

  const [accounts, cards, transactions, goals, subscriptions, otherActiveAdmins] = await Promise.all([
    prisma.financialAccount.count({ where: { ownerUserId: user.id } }),
    prisma.card.count({ where: { ownerUserId: user.id } }),
    prisma.transaction.count({ where: { userId: user.id } }),
    prisma.goal.count({ where: { userId: user.id } }),
    prisma.subscription.count({ where: { userId: user.id } }),
    user.role === "admin" && user.isActive
      ? prisma.user.count({
          where: {
            tenantId: user.tenantId,
            role: "admin",
            isActive: true,
            id: {
              not: user.id
            }
          }
        })
      : Promise.resolve(1)
  ]);

  return {
    userId: user.id,
    currentTenantId: user.tenantId,
    hasOwnData: accounts + cards + transactions + goals + subscriptions > 0,
    isLastActiveAdmin: user.role === "admin" && user.isActive && otherActiveAdmins === 0,
    counts: {
      accounts,
      cards,
      transactions,
      goals,
      subscriptions
    }
  };
}

export function buildReassignmentBlockReason(assessment: UserReassignmentAssessment) {
  if (assessment.isLastActiveAdmin) {
    return "Esta carteira compartilhada precisa manter ao menos um administrador ativo.";
  }

  if (assessment.hasOwnData) {
    return "Esta pessoa já possui dados financeiros próprios. Ainda não é possível unir duas carteiras existentes automaticamente.";
  }

  return null;
}
