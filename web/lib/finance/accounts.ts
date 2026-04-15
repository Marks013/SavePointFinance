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
  accumulatedNet: number;
  periodIncome: number;
  periodExpense: number;
  periodTransferIn: number;
  periodTransferOut: number;
  periodNet: number;
};

export async function getAccountsWithComputedBalance(
  tenantId: string,
  ownerUserId?: string,
  period?: { start: Date; end: Date }
) {
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
        date: true,
        accountId: true,
        destinationAccountId: true,
        amount: true,
        type: true
      }
    })
  ]);

  const balanceMap = new Map<string, number>();
  const periodMap = new Map<
    string,
    {
      income: number;
      expense: number;
      transferIn: number;
      transferOut: number;
      net: number;
    }
  >();
  const accountIds = new Set(accounts.map((account) => account.id));

  for (const account of accounts) {
    balanceMap.set(account.id, Number(account.openingBalance));
    periodMap.set(account.id, {
      income: 0,
      expense: 0,
      transferIn: 0,
      transferOut: 0,
      net: 0
    });
  }

  for (const transaction of transactions) {
    const amount = Number(transaction.amount);
    const isInPeriod = period ? transaction.date >= period.start && transaction.date <= period.end : false;

    if (transaction.accountId && accountIds.has(transaction.accountId)) {
      const current = balanceMap.get(transaction.accountId) ?? 0;

      if (transaction.type === TransactionType.income) {
        balanceMap.set(transaction.accountId, current + amount);
        if (isInPeriod) {
          const periodTotals = periodMap.get(transaction.accountId);

          if (periodTotals) {
            periodTotals.income += amount;
            periodTotals.net += amount;
          }
        }
      } else if (transaction.type === TransactionType.expense || transaction.type === TransactionType.transfer) {
        balanceMap.set(transaction.accountId, current - amount);
        if (isInPeriod) {
          const periodTotals = periodMap.get(transaction.accountId);

          if (periodTotals) {
            if (transaction.type === TransactionType.expense) {
              periodTotals.expense += amount;
            } else {
              periodTotals.transferOut += amount;
            }
            periodTotals.net -= amount;
          }
        }
      }
    }

    if (
      transaction.destinationAccountId &&
      transaction.type === TransactionType.transfer &&
      accountIds.has(transaction.destinationAccountId)
    ) {
      const current = balanceMap.get(transaction.destinationAccountId) ?? 0;
      balanceMap.set(transaction.destinationAccountId, current + amount);

      if (isInPeriod) {
        const periodTotals = periodMap.get(transaction.destinationAccountId);

        if (periodTotals) {
          periodTotals.transferIn += amount;
          periodTotals.net += amount;
        }
      }
    }
  }

  return accounts.map<ComputedAccount>((account) => {
    const openingBalance = Number(account.openingBalance);
    const currentBalance = balanceMap.get(account.id) ?? openingBalance;
    const periodTotals = periodMap.get(account.id) ?? {
      income: 0,
      expense: 0,
      transferIn: 0,
      transferOut: 0,
      net: 0
    };

    return {
      ...account,
      openingBalance,
      currentBalance,
      accumulatedNet: currentBalance - openingBalance,
      periodIncome: periodTotals.income,
      periodExpense: periodTotals.expense,
      periodTransferIn: periodTotals.transferIn,
      periodTransferOut: periodTotals.transferOut,
      periodNet: periodTotals.net
    };
  });
}
