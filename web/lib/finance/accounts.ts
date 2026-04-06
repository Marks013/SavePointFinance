import { TransactionType } from "@prisma/client";

import { prisma } from "@/lib/prisma/client";

export type ComputedAccount = {
  id: string;
  tenantId: string;
  name: string;
  type: string;
  openingBalance: number;
  currentBalance: number;
  currency: string;
  color: string;
  institution: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export async function getAccountsWithComputedBalance(tenantId: string, ownerUserId?: string) {
  const [accounts, transactions] = await Promise.all([
    prisma.financialAccount.findMany({
      where: {
        tenantId,
        ...(ownerUserId ? { ownerUserId } : {})
      },
      orderBy: {
        name: "asc"
      }
    }),
    prisma.transaction.findMany({
      where: {
        tenantId,
        ...(ownerUserId ? { userId: ownerUserId } : {})
      },
      select: {
        accountId: true,
        destinationAccountId: true,
        amount: true,
        type: true
      }
    })
  ]);

  const balanceMap = new Map<string, number>();
  const accountIds = new Set(accounts.map((account) => account.id));

  for (const account of accounts) {
    balanceMap.set(account.id, Number(account.balance));
  }

  for (const transaction of transactions) {
    const amount = Number(transaction.amount);

    if (transaction.accountId && accountIds.has(transaction.accountId)) {
      const current = balanceMap.get(transaction.accountId) ?? 0;

      if (transaction.type === TransactionType.income) {
        balanceMap.set(transaction.accountId, current + amount);
      } else if (transaction.type === TransactionType.expense || transaction.type === TransactionType.transfer) {
        balanceMap.set(transaction.accountId, current - amount);
      }
    }

    if (
      transaction.destinationAccountId &&
      transaction.type === TransactionType.transfer &&
      accountIds.has(transaction.destinationAccountId)
    ) {
      const current = balanceMap.get(transaction.destinationAccountId) ?? 0;
      balanceMap.set(transaction.destinationAccountId, current + amount);
    }
  }

  return accounts.map<ComputedAccount>((account) => ({
    ...account,
    openingBalance: Number(account.balance),
    currentBalance: balanceMap.get(account.id) ?? Number(account.balance)
  }));
}
