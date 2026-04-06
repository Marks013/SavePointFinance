import { TransactionType, type PrismaClient } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma/client";

export const statementMonthSchema = z.string().regex(/^\d{4}-\d{2}$/, "Competencia invalida");

type StatementClient = Pick<PrismaClient, "transaction">;

type CardStatementCard = {
  id: string;
  closeDay: number;
  dueDay: number;
  limitAmount: number | { toString(): string };
};

type StatementTransactionLike = {
  amount: number | { toString(): string };
  type: TransactionType | "income" | "expense" | "transfer";
};

function parseStatementMonth(month: string) {
  const [yearValue, monthValue] = statementMonthSchema.parse(month).split("-");
  return {
    year: Number(yearValue),
    month: Number(monthValue)
  };
}

function formatStatementMonth(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function clampDay(year: number, month: number, day: number) {
  return Math.min(Math.max(day, 1), daysInMonth(year, month));
}

export function getCurrentStatementMonth(closeDay: number, referenceDate = new Date()) {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth() + 1;
  const closingDay = clampDay(year, month, closeDay);
  const dueDateReference =
    referenceDate.getDate() <= closingDay
      ? new Date(year, month - 1, 1)
      : new Date(year, month, 1);

  return dueDateReference.toISOString().slice(0, 7);
}

export function addMonthsToStatementMonth(month: string, amount: number) {
  const { year, month: parsedMonth } = parseStatementMonth(month);
  const shifted = new Date(year, parsedMonth - 1 + amount, 1, 12, 0, 0, 0);

  return formatStatementMonth(shifted.getFullYear(), shifted.getMonth() + 1);
}

export function getStatementRange(month: string, closeDay: number) {
  const { year, month: parsedMonth } = parseStatementMonth(month);
  const currentClosingDay = clampDay(year, parsedMonth, closeDay);
  const previousMonthDate = new Date(year, parsedMonth - 2, 1);
  const previousYear = previousMonthDate.getFullYear();
  const previousMonth = previousMonthDate.getMonth() + 1;
  const previousClosingDay = clampDay(previousYear, previousMonth, closeDay);

  return {
    start: new Date(previousYear, previousMonth - 1, previousClosingDay + 1, 0, 0, 0, 0),
    end: new Date(year, parsedMonth - 1, currentClosingDay, 23, 59, 59, 999)
  };
}

export function getStatementPaymentDate(month: string, dueDay: number) {
  const { year, month: parsedMonth } = parseStatementMonth(month);
  const paymentDay = clampDay(year, parsedMonth, dueDay);
  return new Date(year, parsedMonth - 1, paymentDay, 12, 0, 0, 0);
}

export function getStatementCloseDate(month: string, closeDay: number) {
  const { year, month: parsedMonth } = parseStatementMonth(month);
  const closingDay = clampDay(year, parsedMonth, closeDay);
  return new Date(year, parsedMonth - 1, closingDay, 12, 0, 0, 0);
}

export function getCardExpenseDueDate(
  card: Pick<CardStatementCard, "closeDay" | "dueDay">,
  referenceDate: Date,
  installmentOffset = 0
) {
  const baseStatementMonth = getCurrentStatementMonth(card.closeDay, referenceDate);
  const installmentStatementMonth = addMonthsToStatementMonth(baseStatementMonth, installmentOffset);

  return getStatementPaymentDate(installmentStatementMonth, card.dueDay);
}

export function calculateStatementTotal(transactions: StatementTransactionLike[]) {
  return transactions.reduce((sum, item) => {
    const amount = Number(item.amount);
    const type = String(item.type);

    if (type === TransactionType.expense || type === "expense") {
      return sum + amount;
    }

    if (type === TransactionType.income || type === "income") {
      return sum - amount;
    }

    return sum;
  }, 0);
}

export async function getCardStatementSnapshot({
  tenantId,
  card,
  month,
  client = prisma
}: {
  tenantId: string;
  card: CardStatementCard;
  month?: string;
  client?: StatementClient;
}) {
  const statementMonth = month ?? getCurrentStatementMonth(card.closeDay);
  const { start, end } = getStatementRange(statementMonth, card.closeDay);
  const transactions = await client.transaction.findMany({
    where: {
      tenantId,
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
  const totalAmount = calculateStatementTotal(transactions);

  return {
    month: statementMonth,
    start,
    end,
    totalAmount,
    availableLimit: Number(card.limitAmount) - totalAmount,
    closeDate: getStatementCloseDate(statementMonth, card.closeDay),
    dueDate: getStatementPaymentDate(statementMonth, card.dueDay)
  };
}

export async function getCardStatementSnapshots({
  tenantId,
  cards,
  month,
  client = prisma
}: {
  tenantId: string;
  cards: CardStatementCard[];
  month?: string;
  client?: StatementClient;
}) {
  if (!cards.length) {
    return [];
  }

  const snapshots = cards.map((card) => {
    const statementMonth = month ?? getCurrentStatementMonth(card.closeDay);
    const { start, end } = getStatementRange(statementMonth, card.closeDay);

    return {
      card,
      month: statementMonth,
      start,
      end,
      closeDate: getStatementCloseDate(statementMonth, card.closeDay),
      dueDate: getStatementPaymentDate(statementMonth, card.dueDay)
    };
  });

  const earliestStart = snapshots.reduce(
    (current, item) => (item.start < current ? item.start : current),
    snapshots[0]!.start
  );
  const latestEnd = snapshots.reduce(
    (current, item) => (item.end > current ? item.end : current),
    snapshots[0]!.end
  );

  const transactions = await client.transaction.findMany({
    where: {
      tenantId,
      cardId: {
        in: cards.map((card) => card.id)
      },
      date: {
        gte: earliestStart,
        lte: latestEnd
      }
    },
    select: {
      cardId: true,
      amount: true,
      type: true,
      date: true
    }
  });

  const transactionsByCard = new Map<string, typeof transactions>();
  for (const transaction of transactions) {
    if (!transaction.cardId) {
      continue;
    }

    const current = transactionsByCard.get(transaction.cardId) ?? [];
    current.push(transaction);
    transactionsByCard.set(transaction.cardId, current);
  }

  return snapshots.map((snapshot) => {
    const totalAmount = calculateStatementTotal(
      (transactionsByCard.get(snapshot.card.id) ?? []).filter(
        (transaction) => transaction.date >= snapshot.start && transaction.date <= snapshot.end
      )
    );

    return {
      ...snapshot,
      totalAmount,
      availableLimit: Number(snapshot.card.limitAmount) - totalAmount
    };
  });
}
