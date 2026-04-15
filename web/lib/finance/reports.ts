import { Prisma, TransactionType } from "@prisma/client";

import { getAccountsWithComputedBalance } from "@/lib/finance/accounts";
import { formatMonthKeyLabel, getCurrentMonthKey, getMonthRange } from "@/lib/month";
import { getCardExpenseDueDate } from "@/lib/cards/statement";
import { ensureTenantCardStatementSnapshots } from "@/lib/cards/snapshot-sync";
import { dateKeySchema } from "@/lib/date";
import { prisma } from "@/lib/prisma/client";
import { advanceSubscriptionBillingDate } from "@/lib/subscriptions/recurrence";

export type FinanceReportFilters = {
  month?: string | null; // New field for YYYY-MM competence month
  baseMonth?: string | null;
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

type PeriodScope = "month" | "year" | "custom";
type InsightTone = "positive" | "attention" | "warning";

type MonthlySnapshot = {
  key: string;
  label: string;
  income: number;
  expense: number;
  transfer: number;
  balance: number;
  savingsRate: number;
  transactions: number;
  uncategorizedExpense: number;
};

type QuarterSnapshot = {
  label: string;
  income: number;
  expense: number;
  transfer: number;
  balance: number;
};

type PeriodHighlight = {
  key: string;
  label: string;
  income: number;
  expense: number;
  transfer: number;
  balance: number;
};

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "2-digit"
  }).format(date);
}

function getMonthBucketKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabelFromKey(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return monthLabel(new Date(year, (month ?? 1) - 1, 1, 12, 0, 0, 0));
}

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short"
  }).format(date);
}

function quarterKeyFromMonthKey(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const quarter = Math.floor((((month ?? 1) - 1) / 3)) + 1;
  return `${year}-T${quarter}`;
}

function quarterLabelFromKey(quarterKey: string) {
  const [year, quarter] = quarterKey.split("-T");
  return `T${quarter} ${year}`;
}

function listMonthKeysBetween(start: Date, end: Date) {
  const keys: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1, 12, 0, 0, 0);
  const limit = new Date(end.getFullYear(), end.getMonth(), 1, 12, 0, 0, 0);

  while (cursor <= limit) {
    keys.push(getMonthBucketKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return keys;
}

function detectPeriodScope(start: Date, end: Date): PeriodScope {
  const isWholeMonth =
    start.getDate() === 1 &&
    end.getDate() === new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate() &&
    start.getMonth() === end.getMonth() &&
    start.getFullYear() === end.getFullYear();

  if (isWholeMonth) {
    return "month";
  }

  const isWholeYear =
    start.getMonth() === 0 &&
    start.getDate() === 1 &&
    end.getMonth() === 11 &&
    end.getDate() === 31 &&
    start.getFullYear() === end.getFullYear();

  if (isWholeYear) {
    return "year";
  }

  return "custom";
}

function formatPeriodTitle(scope: PeriodScope, baseMonthKey: string, start: Date, end: Date) {
  if (scope === "year") {
    return `Panorama anual de ${baseMonthKey.slice(0, 4)}`;
  }

  if (scope === "month") {
    return `Leitura financeira de ${formatMonthKeyLabel(baseMonthKey)}`;
  }

  return `Leitura financeira de ${formatShortDate(start)} a ${formatShortDate(end)}`;
}

function formatPeriodSubtitle(scope: PeriodScope, baseMonthKey: string, start: Date, end: Date) {
  if (scope === "year") {
    return "Consolidado anual com comparativos internos, ritmo mensal e sinais de concentração de gastos.";
  }

  if (scope === "month") {
    return `Resumo operacional de ${formatMonthKeyLabel(baseMonthKey)} com caixa, categorias e próximos compromissos.`;
  }

  return `Recorte personalizado entre ${formatShortDate(start)} e ${formatShortDate(end)} com visão consolidada do período.`;
}

function getScopeLabel(scope: PeriodScope) {
  if (scope === "year") {
    return "Consolidado anual";
  }

  if (scope === "month") {
    return "Leitura mensal";
  }

  return "Período personalizado";
}

function pickMonthlyHighlight(
  monthly: MonthlySnapshot[],
  selector: (item: MonthlySnapshot) => number,
  direction: "max" | "min",
  predicate?: (item: MonthlySnapshot) => boolean
): PeriodHighlight | null {
  const candidates = predicate ? monthly.filter(predicate) : monthly;

  if (!candidates.length) {
    return null;
  }

  const sorted = [...candidates].sort((left, right) =>
    direction === "max" ? selector(right) - selector(left) : selector(left) - selector(right)
  );
  const winner = sorted[0];

  if (!winner) {
    return null;
  }

  return {
    key: winner.key,
    label: winner.label,
    income: winner.income,
    expense: winner.expense,
    transfer: winner.transfer,
    balance: winner.balance
  };
}

function pickQuarterHighlight(quarters: QuarterSnapshot[], direction: "max" | "min") {
  if (!quarters.length) {
    return null;
  }

  const sorted = [...quarters].sort((left, right) =>
    direction === "max" ? right.balance - left.balance : left.balance - right.balance
  );

  return sorted[0] ?? null;
}

function getFilterRange(filters: FinanceReportFilters) {
  if (filters.from && filters.to) {
    const parsedFrom = dateKeySchema.safeParse(filters.from);
    const parsedTo = dateKeySchema.safeParse(filters.to);

    if (parsedFrom.success && parsedTo.success) {
      const start = new Date(`${parsedFrom.data}T00:00:00`);
      const end = new Date(`${parsedTo.data}T23:59:59.999`);

      if (start <= end) {
        return { start, end };
      }
    }
  }

  if (filters.month) {
    const { start, end } = getMonthRange(filters.month);
    return { start, end };
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
  const { start, end } = getFilterRange(filters);
  const competenceMonths = listMonthKeysBetween(start, end);
  const where: Prisma.TransactionWhereInput = {
    tenantId,
    ...(userId ? { userId } : {}),
    ...(filters.type === "income" || filters.type === "expense" || filters.type === "transfer"
      ? { type: filters.type }
      : {})
  };

  if (competenceMonths.length === 1) {
    where.competence = competenceMonths[0];
  } else if (competenceMonths.length > 1) {
    where.competence = {
      in: competenceMonths
    };
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
  await ensureTenantCardStatementSnapshots(tenantId);

  const [transactions, subscriptions, cards, goals, accounts, balanceTransactions] = await Promise.all([
    prisma.transaction.findMany({
      where: buildTransactionWhere(tenantId, filters, userId),
      select: {
        id: true,
        amount: true,
        date: true,
        competence: true,
        description: true,
        type: true,
        categoryId: true,
        accountId: true,
        destinationAccountId: true,
        cardId: true,
        classificationSource: true,
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
            dueDay: true,
            statementMonthAnchor: true
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
            dueDay: true,
            statementMonthAnchor: true
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
        statementMonthAnchor: true,
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
        OR: [{ accountId: { not: null } }, { destinationAccountId: { not: null } }]
      },
      select: {
        date: true,
        competence: true,
        accountId: true,
        destinationAccountId: true,
        amount: true,
        type: true
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }]
    })
  ]);

  const monthlyMap = new Map<
    string,
    {
      income: number;
      expense: number;
      transfer: number;
      transactions: number;
      uncategorizedExpense: number;
    }
  >();
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
    const monthKey = transaction.competence ?? getCurrentMonthKey(transaction.date);
    const amount = Number(transaction.amount);
    const monthly = monthlyMap.get(monthKey) ?? {
      income: 0,
      expense: 0,
      transfer: 0,
      transactions: 0,
      uncategorizedExpense: 0
    };
    monthly.transactions += 1;

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
        monthly.uncategorizedExpense += amount;
      }
      if (
        transaction.classificationSource !== "manual_input" &&
        transaction.classificationSource !== "manual_rule" &&
        transaction.classificationSource !== "unknown"
      ) {
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

    monthlyMap.set(monthKey, monthly);
  }

  summary.transactions = transactions.length;
  summary.balance = summary.income - summary.expense;
  const filterStart = projectionStart;
  const filterEnd = projectionEnd;

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
              statementDueDate: {
                gte: projectionStart,
                lte: projectionEnd
              }
            },
            select: {
              cardId: true,
              competence: true,
              amount: true,
              type: true,
              statementDueDate: true
            }
          })
        ])
      : [[], []];

  const paidStatementSet = new Set(statementPayments.map((item) => `${item.cardId}:${item.month}`));
  const statementGroups = new Map<
    string,
    {
      cardId: string;
      statementMonth: string;
      dueDate: Date;
      items: typeof statementTransactions;
    }
  >();

  for (const transaction of statementTransactions) {
    if (!transaction.cardId || !transaction.statementDueDate || !transaction.competence) {
      continue;
    }

    const groupKey = `${transaction.cardId}:${transaction.competence}`;
    const current = statementGroups.get(groupKey) ?? {
      cardId: transaction.cardId,
      statementMonth: transaction.competence,
      dueDate: transaction.statementDueDate,
      items: []
    };
    current.items.push(transaction);
    statementGroups.set(groupKey, current);
  }

  const cardsById = new Map(cardsWithStatements.map((card) => [card.id, card]));
  const cardStatementEvents = Array.from(statementGroups.values())
    .map((group) => {
      if (paidStatementSet.has(`${group.cardId}:${group.statementMonth}`)) {
        return null;
      }

      const card = cardsById.get(group.cardId);
      if (!card) {
        return null;
      }

      const statementAmount = group.items.reduce((sum, item) => {
        const amount = Number(item.amount);

        if (item.type === TransactionType.expense) {
          return sum + amount;
        }

        if (item.type === TransactionType.income) {
          return sum - amount;
        }

        return sum;
      }, 0);

      if (statementAmount <= 0) {
        return null;
      }

      return {
        date: group.dueDate.toISOString(),
        label: `Fatura ${card.name}`,
        amount: statementAmount,
        type: "expense" as const,
        source: "card_statement" as const,
        reference: `${group.cardId}-${group.statementMonth}`
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

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
  const periodMonthKeys = listMonthKeysBetween(projectionStart, projectionEnd);
  const openingCutoffMonth = periodMonthKeys[0] ?? getCurrentMonthKey(projectionStart);
  const closingCutoffMonth = periodMonthKeys.at(periodMonthKeys.length - 1) ?? openingCutoffMonth;

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
    const competenceMonth = transaction.competence ?? getCurrentMonthKey(transaction.date);
    const affectsOpening = competenceMonth < openingCutoffMonth;
    const affectsClosing = competenceMonth <= closingCutoffMonth;

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
          if (affectsOpening) {
            account.opening += effect;
          }

          if (affectsClosing) {
            account.closing += effect;
          }
        }
      }
    }

    if (transaction.destinationAccountId && transaction.type === TransactionType.transfer) {
      const account = activeAccountBalances.get(transaction.destinationAccountId);

      if (account) {
        if (affectsOpening) {
          account.opening += amount;
        }

        if (affectsClosing) {
          account.closing += amount;
        }
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
  const periodScope = detectPeriodScope(projectionStart, projectionEnd);
  const periodMonths = periodMonthKeys.length;
  const baseMonthKey = filters.baseMonth ?? periodMonthKeys.at(periodMonthKeys.length - 1) ?? getCurrentMonthKey(projectionEnd);
  const currentBalance = accounts
    .filter((account) => account.isActive)
    .reduce((sum, account) => sum + account.currentBalance, 0);
  const monthlySeries: MonthlySnapshot[] = periodMonthKeys.map((monthKey) => {
    const values = monthlyMap.get(monthKey) ?? {
      income: 0,
      expense: 0,
      transfer: 0,
      transactions: 0,
      uncategorizedExpense: 0
    };
    const balance = values.income - values.expense;

    return {
      key: monthKey,
      label: monthLabelFromKey(monthKey),
      income: values.income,
      expense: values.expense,
      transfer: values.transfer,
      balance,
      savingsRate: values.income > 0 ? balance / values.income : 0,
      transactions: values.transactions,
      uncategorizedExpense: values.uncategorizedExpense
    };
  });
  const quarterlyMap = new Map<string, QuarterSnapshot>();

  for (const month of monthlySeries) {
    const quarterKey = quarterKeyFromMonthKey(month.key);
    const quarter = quarterlyMap.get(quarterKey) ?? {
      label: quarterLabelFromKey(quarterKey),
      income: 0,
      expense: 0,
      transfer: 0,
      balance: 0
    };

    quarter.income += month.income;
    quarter.expense += month.expense;
    quarter.transfer += month.transfer;
    quarter.balance += month.balance;
    quarterlyMap.set(quarterKey, quarter);
  }

  const quarters = Array.from(quarterlyMap.values());
  const byAccount = Array.from(accountMap.values()).sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  const byCard = Array.from(cardMap.values()).sort((a, b) => b.netStatement - a.netStatement);
  const totalFlow = summary.income + summary.expense + summary.transfer;
  const topCategoriesShare =
    summary.expense > 0
      ? categoryInsights.slice(0, 3).reduce((sum, item) => sum + item.total, 0) / summary.expense
      : 0;
  const uncategorizedExpenseShare = summary.expense > 0 ? summary.uncategorizedExpense / summary.expense : 0;
  const positiveMonths = monthlySeries.filter((item) => item.balance > 0).length;
  const negativeMonths = monthlySeries.filter((item) => item.balance < 0).length;
  const neutralMonths = monthlySeries.filter((item) => item.balance === 0).length;
  const activeMonths = monthlySeries.filter((item) => item.transactions > 0).length;
  const bestMonth = pickMonthlyHighlight(monthlySeries, (item) => item.balance, "max", (item) => item.transactions > 0);
  const worstMonth = pickMonthlyHighlight(monthlySeries, (item) => item.balance, "min", (item) => item.transactions > 0);
  const highestIncomeMonth = pickMonthlyHighlight(
    monthlySeries,
    (item) => item.income,
    "max",
    (item) => item.income > 0
  );
  const highestExpenseMonth = pickMonthlyHighlight(
    monthlySeries,
    (item) => item.expense,
    "max",
    (item) => item.expense > 0
  );
  const strongestQuarter = pickQuarterHighlight(quarters, "max");
  const weakestQuarter = pickQuarterHighlight(quarters, "min");
  const balanceSpread =
    bestMonth && worstMonth ? Math.max(bestMonth.balance - worstMonth.balance, 0) : 0;

  const narrativeTone: InsightTone =
    summary.transactions === 0
      ? "attention"
      : summary.balance < 0 || negativeMonths > positiveMonths
        ? "warning"
        : summary.savingsRate >= 0.12
          ? "positive"
          : "attention";
  const narrativeHeadline =
    summary.transactions === 0
      ? "Ainda não há movimentação suficiente para uma leitura anual consistente"
      : narrativeTone === "warning"
        ? periodScope === "year"
          ? "O ano fechou sob pressão e pede correção de rota"
          : "O período fechou pressionado e exige ajuste operacional"
        : narrativeTone === "positive"
          ? periodScope === "year"
            ? "O ano fechou com resultado saudável e margem de manobra"
            : "O período terminou com folga operacional"
          : periodScope === "year"
            ? "O ano ficou positivo, mas com sinais de atenção"
            : "O período ficou positivo, mas ainda sem folga confortável";
  const narrativeSummary =
    summary.transactions === 0
      ? "O recorte atual ainda não tem volume de transações para sustentar uma leitura executiva confiável."
      : periodScope === "year"
        ? `${positiveMonths} meses positivos, ${negativeMonths} meses negativos e resultado acumulado de ${summary.balance.toLocaleString(
            "pt-BR",
            { style: "currency", currency: "BRL" }
          )}.`
        : `${summary.transactions} lançamentos analisados com resultado de ${summary.balance.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL"
          })} no período.`;
  const narrativeFocus =
    topCategoriesShare >= 0.5
      ? `As três maiores categorias concentram ${Math.round(topCategoriesShare * 100)}% das despesas.`
      : worstMonth
        ? `O ponto mais pressionado foi ${worstMonth.label}, com saldo de ${worstMonth.balance.toLocaleString(
            "pt-BR",
            { style: "currency", currency: "BRL" }
          )}.`
        : "A distribuição de despesas segue relativamente equilibrada no recorte atual.";
  const alerts = [
    summary.balance < 0
      ? {
          tone: "warning" as const,
          title: "Resultado acumulado negativo",
          detail: "As despesas superaram as receitas no recorte analisado."
        }
      : null,
    uncategorizedExpenseShare >= 0.1
      ? {
          tone: "attention" as const,
          title: "Despesa sem categoria relevante",
          detail: `${Math.round(uncategorizedExpenseShare * 100)}% das despesas ainda estão sem categorização.`
        }
      : null,
    topCategoriesShare >= 0.55
      ? {
          tone: "attention" as const,
          title: "Alta concentração de gastos",
          detail: `As três maiores categorias representam ${Math.round(topCategoriesShare * 100)}% da despesa total.`
        }
      : null,
    positiveMonths >= Math.max(1, Math.ceil(periodMonths * 0.7)) && summary.balance > 0
      ? {
          tone: "positive" as const,
          title: "Cadência financeira estável",
          detail: `${positiveMonths} de ${periodMonths} meses fecharam positivos.`
        }
      : null
  ].filter((item): item is { tone: InsightTone; title: string; detail: string } => item !== null);

  return {
    period: {
      from: projectionStart.toISOString(),
      to: projectionEnd.toISOString(),
      scope: periodScope,
      months: periodMonths
    },
    labels: {
      periodTitle: formatPeriodTitle(periodScope, baseMonthKey, projectionStart, projectionEnd),
      periodSubtitle: formatPeriodSubtitle(periodScope, baseMonthKey, projectionStart, projectionEnd),
      scopeLabel: getScopeLabel(periodScope),
      baseMonthLabel: formatMonthKeyLabel(baseMonthKey)
    },
    summary,
    classification: {
      autoClassified: classifiedAutomatically,
      uncategorized: uncategorizedTransactions,
      coverage:
        transactions.length > 0
          ? (transactions.length - uncategorizedTransactions) / transactions.length
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
    comparison: {
      averageIncome: periodMonths > 0 ? summary.income / periodMonths : 0,
      averageExpense: periodMonths > 0 ? summary.expense / periodMonths : 0,
      averageTransfer: periodMonths > 0 ? summary.transfer / periodMonths : 0,
      expenseToIncomeRatio: summary.income > 0 ? summary.expense / summary.income : null,
      transferShare: totalFlow > 0 ? summary.transfer / totalFlow : 0,
      topAccount: byAccount[0] ?? null,
      topCard: byCard[0] ?? null,
      topCategory
    },
    annualInsights: {
      narrative: {
        tone: narrativeTone,
        headline: narrativeHeadline,
        summary: narrativeSummary,
        focus: narrativeFocus
      },
      highlights: {
        bestMonth,
        worstMonth,
        highestIncomeMonth,
        highestExpenseMonth,
        strongestQuarter,
        weakestQuarter
      },
      cadence: {
        activeMonths,
        positiveMonths,
        negativeMonths,
        neutralMonths,
        averageMonthlyBalance: periodMonths > 0 ? summary.balance / periodMonths : 0,
        balanceSpread
      },
      concentration: {
        topCategoriesShare,
        uncategorizedExpenseShare
      },
      quarters,
      alerts
    },
    filters,
    monthly: monthlySeries,
    byCategory: categoryInsights,
    byAccount,
    byCard,
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
