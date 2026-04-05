import { Prisma, TransactionType } from "@prisma/client";

import { getCurrentStatementMonth, getStatementPaymentDate, getStatementRange } from "@/lib/cards/statement";
import { prisma } from "@/lib/prisma/client";

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

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "2-digit"
  }).format(date);
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
      where.date.gte = new Date(`${filters.from}T00:00:00`);
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
  const now = new Date();
  const projectionEnd = new Date(now);
  projectionEnd.setDate(projectionEnd.getDate() + 30);

  const [transactions, subscriptions, cards, goals] = await Promise.all([
    prisma.transaction.findMany({
      where: buildTransactionWhere(tenantId, filters, userId),
      include: {
        category: true,
        financialAccount: true,
        destinationAccount: true,
        card: true
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }]
    }),
    prisma.subscription.findMany({
      where: {
        tenantId,
        ...(userId ? { userId } : {}),
        isActive: true,
        nextBillingDate: {
          gte: now,
          lte: projectionEnd
        }
      },
      orderBy: {
        nextBillingDate: "asc"
      }
    }),
    prisma.card.findMany({
      where: {
        tenantId,
        ...(userId ? { ownerUserId: userId } : {}),
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
          gte: now,
          lte: projectionEnd
        }
      },
      orderBy: {
        deadline: "asc"
      }
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

  for (const transaction of transactions) {
    const label = monthLabel(transaction.date);
    const amount = Number(transaction.amount);
    const monthly = monthlyMap.get(label) ?? { income: 0, expense: 0, transfer: 0 };

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

  summary.balance = summary.income - summary.expense;
  const filterStart = filters.from ? new Date(`${filters.from}T00:00:00`) : transactions[0]?.date ?? now;
  const filterEnd = filters.to ? new Date(`${filters.to}T23:59:59`) : transactions.at(-1)?.date ?? now;
  const totalDays = Math.max(
    1,
    Math.ceil((filterEnd.getTime() - filterStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
  );
  summary.averageDailyExpense = summary.expense / totalDays;
  summary.savingsRate = summary.income > 0 ? summary.balance / summary.income : 0;

  const upcoming: ProjectionEvent[] = subscriptions.map((subscription) => ({
    date: subscription.nextBillingDate.toISOString(),
    label: subscription.name,
    amount: Number(subscription.amount),
    type: subscription.type === "income" ? "income" : "expense",
    source: "subscription",
    reference: subscription.id
  }));

  for (const card of cards) {
    const statementMonth = getCurrentStatementMonth(card.closeDay, now);
    const dueDate = getStatementPaymentDate(statementMonth, card.dueDay);

    if (dueDate < now || dueDate > projectionEnd) {
      continue;
    }

    const payment = await prisma.statementPayment.findUnique({
      where: {
        tenantId_cardId_month: {
          tenantId,
          cardId: card.id,
          month: statementMonth
        }
      }
    });

    if (payment) {
      continue;
    }

    const { start, end } = getStatementRange(statementMonth, card.closeDay);
    const statementTransactions = await prisma.transaction.findMany({
      where: {
        tenantId,
        ...(userId ? { userId } : {}),
        cardId: card.id,
        date: {
          gte: start,
          lte: end
        }
      },
      select: {
        amount: true,
        type: true
      }
    });

    const statementAmount = statementTransactions.reduce((sum, item) => {
      const amount = Number(item.amount);
      if (item.type === TransactionType.expense) {
        return sum + amount;
      }
      if (item.type === TransactionType.income) {
        return sum - amount;
      }
      return sum;
    }, 0);

    if (statementAmount > 0) {
      upcoming.push({
        date: dueDate.toISOString(),
        label: `Fatura ${card.name}`,
        amount: statementAmount,
        type: "expense",
        source: "card_statement",
        reference: card.id
      });
    }
  }

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
      } else {
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

  return {
    summary,
    classification: {
      autoClassified: classifiedAutomatically,
      uncategorized: uncategorizedTransactions,
      coverage:
        transactions.length > 0 ? (transactions.length - uncategorizedTransactions) / transactions.length : 0
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
      horizonDays: 30,
      income: projection.income,
      expense: projection.expense,
      cardPayments: projection.cardPayments,
      net: projection.income - projection.expense
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
    recent: transactions
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
