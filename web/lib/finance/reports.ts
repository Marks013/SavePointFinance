import { Prisma, TransactionType } from "@prisma/client";

import { getAccountsWithComputedBalance } from "@/lib/finance/accounts";
import { getCurrentMonthKey, getMonthRange } from "@/lib/month";
import {
  calculateStatementTotal,
  getCardExpenseCompetenceDate,
  getCardExpenseDueDate,
  getStatementPaymentDate,
  getStatementRange
} from "@/lib/cards/statement";
import { prisma } from "@/lib/prisma/client";
import { advanceSubscriptionBillingDate } from "@/lib/subscriptions/recurrence";

export type FinanceReportFilters = {
  from?: string | null;
  to?: string | null;
  type?: string | null;
  accountId?: string | null;
  cardId?: string | null;
  categoryId?: string | null;
};

type ProjectionEvent = {
  date: string;
  label: string;
  amount: number;
  type: "income" | "expense";
  source: "subscription" | "card_statement" | "goal_deadline";
  reference: string;
};

type CategoryInsight = {
  id: string | null;
  name: string;
  total: number;
  items: number;
  share: number;
};

type AccountBalancePoint = {
  opening: number;
  closing: number;
};

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "2-digit"
  }).format(date);
}

function getFilterRange(filters: FinanceReportFilters) {
  if (filters.from && filters.to) {
    return {
      start: new Date(`${filters.from}T00:00:00`),
      end: new Date(`${filters.to}T23:59:59`)
    };
  }

  const month = getCurrentMonthKey();
  const { start, end } = getMonthRange(month);
  return { start, end };
}

function listStatementMonthsBetween(start: Date, end: Date) {
  const months: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1, 12, 0, 0, 0);
  const limit = new Date(end.getFullYear(), end.getMonth(), 1, 12, 0, 0, 0);

  while (cursor <= limit) {
    months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
}

function buildTransactionWhere(
  tenantId: string,
  filters: FinanceReportFilters,
  userId?: string
): Prisma.TransactionWhereInput {
  const where: Prisma.TransactionWhereInput = {
    tenantId,
    ...(userId ? { userId } : {}),
    ...(filters.type === "income" || filters.type === "expense" || filters.type === "transfer"
      ? { type: filters.type }
      : {})
  };

  if (filters.from || filters.to) {
    where.date = {};

    if (filters.from) {
      const fromDate = new Date(`${filters.from}T00:00:00`);
      fromDate.setMonth(fromDate.getMonth() - 1);
      where.date.gte = fromDate;
    }

    if (filters.to) {
      where.date.lte = new Date(`${filters.to}T23:59:59`);
    }
  }

  if (filters.accountId) {
    where.OR = [{ accountId: filters.accountId }, { destinationAccountId: filters.accountId }];
  }

  if (filters.cardId) {
    where.cardId = filters.cardId;
  }

  if (filters.categoryId) {
    where.categoryId = filters.categoryId;
  }

  return where;
}

export async function getFinanceReport(tenantId: string, filters: FinanceReportFilters, userId?: string) {
  const { start: projectionStart, end: projectionEnd } = getFilterRange(filters);

  const [transactions, subscriptions, cards, goals, accounts, balanceTransactions] = await Promise.all([
    prisma.transaction.findMany({
      where: buildTransactionWhere(tenantId, filters, userId),
      select: {
        id: true,
        amount: true,
        date: true,
        description: true,
        type: true,
        categoryId: true,
        accountId: true,
        destinationAccountId: true,
        cardId: true,
        aiClassified: true,
        aiConfidence: true,
        category: {
          select: {
            id: true,
            name: true
          }
        },
        financialAccount: {
          select: {
            name: true
          }
        },
        destinationAccount: {
          select: {
            name: true
          }
        },
        card: {
          select: {
            name: true,
            brand: true,
            closeDay: true,
            dueDay: true
          }
        }
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }]
    }),
    prisma.subscription.findMany({
      where: {
        tenantId,
        ...(userId ? { userId } : {}),
        isActive: true
      },
      select: {
        id: true,
        name: true,
        amount: true,
        billingDay: true,
        type: true,
        nextBillingDate: true,
        card: {
          select: {
            id: true,
            closeDay: true,
            dueDay: true
          }
        }
      },
      orderBy: {
        nextBillingDate: "asc"
      }
    }),
    prisma.card.findMany({
      where: {
        tenantId,
        isActive: true
      },
      select: {
        id: true,
        name: true,
        dueDay: true,
        closeDay: true,
        isActive: true
      },
      orderBy: {
        name: "asc"
      }
    }),
    prisma.goal.findMany({
      where: {
        tenantId,
        ...(userId ? { userId } : {}),
        isCompleted: false,
        deadline: {
          not: null,
          gte: projectionStart,
          lte: projectionEnd
        }
      },
      select: {
        id: true,
        name: true,
        targetAmount: true,
        currentAmount: true,
        deadline: true
      },
      orderBy: {
        deadline: "asc"
      }
    }),
    getAccountsWithComputedBalance(tenantId, userId),
    prisma.transaction.findMany({
      where: {
        tenantId,
        ...(userId ? { userId } : {}),
        date: {
          lte: projectionEnd
        },
        OR: [{ accountId: { not: null } }, { destinationAccountId: { not: null } }]
      },
      select: {
        date: true,
        accountId: true,
        destinationAccountId: true,
        amount: true,
        type: true
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }]
    })
  ]);

  const monthlyMap = new Map<string, { income: number; expense: number; transfer: number }>();
  const categoryMap = new Map<string, { id: string | null; name: string; total: number; items: number }>();
  const accountMap = new Map<
    string,
    {
      id: string;
      name: string;
      income: number;
      expense: number;
      transferIn: number;
      transferOut: number;
      net: number;
    }
  >();
  const cardMap = new Map<
    string,
    {
      id: string;
      name: string;
      brand: string;
      spent: number;
      refunds: number;
      netStatement: number;
      transactions: number;
    }
  >();

  const summary = {
    income: 0,
    expense: 0,
    transfer: 0,
    balance: 0,
    transactions: transactions.length,
    averageDailyExpense: 0,
    savingsRate: 0,
    uncategorizedExpense: 0
  };
  let classifiedAutomatically = 0;
  let uncategorizedTransactions = 0;
  let transactionsInRange = 0;
  const filteredTransactions = transactions.filter((transaction) => {
    const competenceDate = transaction.card
      ? getCardExpenseCompetenceDate(transaction.card, transaction.date)
      : transaction.date;

    return competenceDate >= projectionStart && competenceDate <= projectionEnd;
  });

  for (const transaction of filteredTransactions) {
    const competenceDate = transaction.card
      ? getCardExpenseCompetenceDate(transaction.card, transaction.date)
      : transaction.date;
    const label = monthLabel(competenceDate);
    const amount = Number(transaction.amount);
    const monthly = monthlyMap.get(label) ?? { income: 0, expense: 0, transfer: 0 };
    transactionsInRange += 1;

    if (transaction.type === TransactionType.income) {
      summary.income += amount;
      monthly.income += amount;
    }

    if (transaction.type === TransactionType.expense) {
      summary.expense += amount;
      monthly.expense += amount;

      const categoryName = transaction.category?.name ?? "Sem categoria";
      if (!transaction.categoryId) {
        summary.uncategorizedExpense += amount;
        uncategorizedTransactions += 1;
      }
      if (transaction.aiClassified || transaction.aiConfidence !== null) {
        classifiedAutomatically += 1;
      }
      const category = categoryMap.get(categoryName) ?? {
        id: transaction.category?.id ?? null,
        name: categoryName,
        total: 0,
        items: 0
      };
      category.total += amount;
      category.items += 1;
      categoryMap.set(categoryName, category);
    }

    if (transaction.type === TransactionType.transfer) {
      summary.transfer += amount;
      monthly.transfer += amount;
    }

    if (transaction.accountId && transaction.financialAccount) {
      const account = accountMap.get(transaction.accountId) ?? {
        id: transaction.accountId,
        name: transaction.financialAccount.name,
        income: 0,
        expense: 0,
        transferIn: 0,
        transferOut: 0,
        net: 0
      };

      if (transaction.type === TransactionType.income) {
        account.income += amount;
        account.net += amount;
      }

      if (transaction.type === TransactionType.expense) {
        account.expense += amount;
        account.net -= amount;
      }

      if (transaction.type === TransactionType.transfer) {
        account.transferOut += amount;
        account.net -= amount;
      }

      accountMap.set(transaction.accountId, account);
    }

    if (transaction.destinationAccountId && transaction.destinationAccount) {
      const account = accountMap.get(transaction.destinationAccountId) ?? {
        id: transaction.destinationAccountId,
        name: transaction.destinationAccount.name,
        income: 0,
        expense: 0,
        transferIn: 0,
        transferOut: 0,
        net: 0
      };

      if (transaction.type === TransactionType.transfer) {
        account.transferIn += amount;
        account.net += amount;
      }

      accountMap.set(transaction.destinationAccountId, account);
    }

    if (transaction.cardId && transaction.card) {
      const card = cardMap.get(transaction.cardId) ?? {
        id: transaction.cardId,
        name: transaction.card.name,
        brand: transaction.card.brand,
        spent: 0,
        refunds: 0,
        netStatement: 0,
        transactions: 0
      };

      if (transaction.type === TransactionType.expense) {
        card.spent += amount;
        card.netStatement += amount;
      }

      if (transaction.type === TransactionType.income) {
        card.refunds += amount;
        card.netStatement -= amount;
      }

      card.transactions += 1;
      cardMap.set(transaction.cardId, card);
    }

    monthlyMap.set(label, monthly);
  }

  summary.transactions = transactionsInRange;
  summary.balance = summary.income - summary.expense;
  const filterStart =
    filters.from
      ? new Date(`${filters.from}T00:00:00`)
      : (filteredTransactions[0]?.card
          ? getCardExpenseCompetenceDate(filteredTransactions[0].card, filteredTransactions[0].date)
          : filteredTransactions[0]?.date) ?? projectionStart;
  const lastFilteredTransaction = filteredTransactions.at(-1);
  const filterEnd =
    filters.to
      ? new Date(`${filters.to}T23:59:59`)
      : (lastFilteredTransaction
          ? lastFilteredTransaction.card
            ? getCardExpenseCompetenceDate(lastFilteredTransaction.card, lastFilteredTransaction.date)
            : lastFilteredTransaction.date
          : projectionEnd);
  const totalDays = Math.max(
    1,
    Math.ceil((filterEnd.getTime() - filterStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
  );
  summary.averageDailyExpense = summary.expense / totalDays;
  summary.savingsRate = summary.income > 0 ? summary.balance / summary.income : 0;

  const upcoming: ProjectionEvent[] = [];
  for (const subscription of subscriptions) {
    let occurrenceDate = new Date(subscription.nextBillingDate);

    while (
      (subscription.card ? getCardExpenseDueDate(subscription.card, occurrenceDate) : occurrenceDate) < projectionStart
    ) {
      occurrenceDate = advanceSubscriptionBillingDate(occurrenceDate, subscription.billingDay);
    }

    while (occurrenceDate <= projectionEnd) {
      const projectedDate = subscription.card
        ? getCardExpenseDueDate(subscription.card, occurrenceDate)
        : occurrenceDate;

      if (projectedDate > projectionEnd) {
        break;
      }

      upcoming.push({
        date: projectedDate.toISOString(),
        label: subscription.name,
        amount: Number(subscription.amount),
        type: subscription.type === "income" ? "income" : "expense",
        source: "subscription",
        reference: `${subscription.id}-${occurrenceDate.toISOString().slice(0, 10)}`
      });

      occurrenceDate = advanceSubscriptionBillingDate(occurrenceDate, subscription.billingDay);
    }
  }

  const statementMonthStart = new Date(projectionStart);
  statementMonthStart.setMonth(statementMonthStart.getMonth() - 1);
  statementMonthStart.setDate(1);
  statementMonthStart.setHours(12, 0, 0, 0);
  const statementMonths = listStatementMonthsBetween(statementMonthStart, projectionEnd);
  const cardsWithStatements = cards.filter((card) => card.isActive);
  const earliestStatementStart = new Date(projectionStart);
  earliestStatementStart.setMonth(earliestStatementStart.getMonth() - 1);
  earliestStatementStart.setDate(1);
  earliestStatementStart.setHours(0, 0, 0, 0);

  const [statementPayments, statementTransactions] =
    cardsWithStatements.length > 0 && statementMonths.length > 0
      ? await Promise.all([
          prisma.statementPayment.findMany({
            where: {
              tenantId,
              cardId: {
                in: cardsWithStatements.map((card) => card.id)
              },
              month: {
                in: statementMonths
              }
            },
            select: {
              cardId: true,
              month: true
            }
          }),
          prisma.transaction.findMany({
            where: {
              tenantId,
              ...(userId ? { userId } : {}),
              cardId: {
                in: cardsWithStatements.map((card) => card.id)
              },
              date: {
                gte: earliestStatementStart,
                lte: projectionEnd
              }
            },
            select: {
              cardId: true,
              date: true,
              amount: true,
              type: true
            }
          })
        ])
      : [[], []];

  const paidStatementSet = new Set(statementPayments.map((item) => `${item.cardId}:${item.month}`));
  const transactionsByCard = new Map<string, typeof statementTransactions>();

  for (const transaction of statementTransactions) {
    if (!transaction.cardId) {
      continue;
    }

    const current = transactionsByCard.get(transaction.cardId) ?? [];
    current.push(transaction);
    transactionsByCard.set(transaction.cardId, current);
  }

  const cardStatementEvents = cardsWithStatements.flatMap((card) =>
    statementMonths
      .map((statementMonth) => {
        const dueDate = getStatementPaymentDate(statementMonth, card.dueDay, card.closeDay);

        if (dueDate < projectionStart || dueDate > projectionEnd) {
          return null;
        }

        if (paidStatementSet.has(`${card.id}:${statementMonth}`)) {
          return null;
        }

        const { start, end } = getStatementRange(statementMonth, card.closeDay, card.dueDay);
        const statementAmount = calculateStatementTotal(
          (transactionsByCard.get(card.id) ?? []).filter((item) => item.date >= start && item.date <= end)
        );

        if (statementAmount <= 0) {
          return null;
        }

        return {
          date: dueDate.toISOString(),
          label: `Fatura ${card.name}`,
          amount: statementAmount,
          type: "expense" as const,
          source: "card_statement" as const,
          reference: `${card.id}-${statementMonth}`
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
  );

  upcoming.push(...cardStatementEvents);

  for (const goal of goals) {
    if (!goal.deadline) {
      continue;
    }

    const remaining = Math.max(Number(goal.targetAmount) - Number(goal.currentAmount), 0);
    if (remaining <= 0) {
      continue;
    }

    upcoming.push({
      date: goal.deadline.toISOString(),
      label: `Meta ${goal.name}`,
      amount: remaining,
      type: "expense",
      source: "goal_deadline",
      reference: goal.id
    });
  }

  upcoming.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const projection = upcoming.reduce(
    (acc, item) => {
      if (item.type === "income") {
        acc.income += item.amount;
      } else if (item.source !== "goal_deadline") {
        acc.expense += item.amount;
        if (item.source === "card_statement") {
          acc.cardPayments += item.amount;
        }
      }
      return acc;
    },
    {
      income: 0,
      expense: 0,
      cardPayments: 0
    }
  );

  const byCategory = Array.from(categoryMap.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);
  const totalExpenseBase = Math.max(summary.expense, 1);
  const categoryInsights: CategoryInsight[] = byCategory.map((item) => ({
    ...item,
    share: item.total / totalExpenseBase
  }));
  const topCategory = categoryInsights[0] ?? null;
  const activeAccountBalances = new Map<string, AccountBalancePoint>();

  for (const account of accounts) {
    if (!account.isActive) {
      continue;
    }

    const openingBalance = Number(account.openingBalance);
    activeAccountBalances.set(account.id, {
      opening: openingBalance,
      closing: openingBalance
    });
  }

  for (const transaction of balanceTransactions) {
    const amount = Number(transaction.amount);

    if (transaction.accountId) {
      const account = activeAccountBalances.get(transaction.accountId);

      if (account) {
        const effect =
          transaction.type === TransactionType.income
            ? amount
            : transaction.type === TransactionType.expense || transaction.type === TransactionType.transfer
              ? -amount
              : 0;

        if (effect !== 0) {
          if (transaction.date < projectionStart) {
            account.opening += effect;
          }

          account.closing += effect;
        }
      }
    }

    if (transaction.destinationAccountId && transaction.type === TransactionType.transfer) {
      const account = activeAccountBalances.get(transaction.destinationAccountId);

      if (account) {
        if (transaction.date < projectionStart) {
          account.opening += amount;
        }

        account.closing += amount;
      }
    }
  }

  const periodBalanceTotals = Array.from(activeAccountBalances.values()).reduce(
    (totals, account) => ({
      opening: totals.opening + account.opening,
      closing: totals.closing + account.closing
    }),
    {
      opening: 0,
      closing: 0
    }
  );
  const currentBalance = accounts
    .filter((account) => account.isActive)
    .reduce((sum, account) => sum + account.currentBalance, 0);

  return {
    summary,
    classification: {
      autoClassified: classifiedAutomatically,
      uncategorized: uncategorizedTransactions,
      coverage:
        filteredTransactions.length > 0
          ? (filteredTransactions.length - uncategorizedTransactions) / filteredTransactions.length
          : 0
    },
    spendingInsights: {
      topCategory,
      essentialExpenses: categoryInsights
        .filter((item) =>
          ["Moradia", "Condomínio", "Energia elétrica", "Água e saneamento", "Internet e telefonia", "Saúde"].includes(
            item.name
          )
        )
        .reduce((sum, item) => sum + item.total, 0),
      lifestyleExpenses: categoryInsights
        .filter((item) =>
          ["Restaurantes", "Delivery", "Lazer", "Streaming e assinaturas", "Viagem", "Café e padaria"].includes(
            item.name
          )
        )
        .reduce((sum, item) => sum + item.total, 0),
      categoryBreakdown: categoryInsights
    },
    projection: {
      horizonDays: Math.max(1, Math.ceil((projectionEnd.getTime() - projectionStart.getTime()) / (1000 * 60 * 60 * 24)) + 1),
      currentBalance,
      income: projection.income,
      expense: projection.expense,
      cardPayments: projection.cardPayments,
      net: projection.income - projection.expense,
      endingBalance: currentBalance + projection.income - projection.expense
    },
    periodBalances: {
      opening: periodBalanceTotals.opening,
      closing: periodBalanceTotals.closing,
      net: periodBalanceTotals.closing - periodBalanceTotals.opening
    },
    filters,
    monthly: Array.from(monthlyMap.entries()).map(([label, values]) => ({
      label,
      income: values.income,
      expense: values.expense,
      transfer: values.transfer
    })),
    byCategory: categoryInsights,
    byAccount: Array.from(accountMap.values()).sort((a, b) => Math.abs(b.net) - Math.abs(a.net)),
    byCard: Array.from(cardMap.values()).sort((a, b) => b.netStatement - a.netStatement),
    upcoming: upcoming.slice(0, 12),
    recent: filteredTransactions
      .slice(-12)
      .reverse()
      .map((transaction) => ({
        id: transaction.id,
        description: transaction.description,
        amount: Number(transaction.amount),
        type: transaction.type,
        date: transaction.date.toISOString(),
        category: transaction.category?.name ?? "Sem categoria",
        account: transaction.financialAccount?.name ?? null,
        destinationAccount: transaction.destinationAccount?.name ?? null,
        card: transaction.card?.name ?? null
      }))
  };
}
