import { StatementMonthAnchor, TransactionType, type PrismaClient } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma/client";

export const statementMonthSchema = z.string().regex(/^\d{4}-\d{2}$/, "Competencia invalida");

type StatementClient = Pick<PrismaClient, "transaction" | "statementPayment">;

type CardStatementCard = {
  id: string;
  closeDay: number;
  dueDay: number;
  statementMonthAnchor: StatementMonthAnchor;
  limitAmount: number | { toString(): string };
};

type StatementTransactionLike = {
  amount: number | { toString(): string };
  type: TransactionType | "income" | "expense" | "transfer";
};

type StatementPaymentLike = {
  amount: number | { toString(): string };
  month?: string;
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

function getCompetenceMonthDate(month: string) {
  const { year, month: parsedMonth } = parseStatementMonth(month);
  return new Date(year, parsedMonth - 1, 1, 12, 0, 0, 0);
}

function getStatementMonthAnchorOffset(anchor: StatementMonthAnchor) {
  return anchor === "previous_month" ? -1 : 0;
}

function getStatementMonthOffsetForDue(closeDay: number, dueDay: number) {
  return dueDay > closeDay ? 0 : 1;
}

function getNextClosingDate(referenceDate: Date, closeDay: number) {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth() + 1;
  const closingDay = clampDay(year, month, closeDay);
  const currentMonthCloseBoundary = new Date(year, month - 1, closingDay, 0, 0, 0, 0);

  // Purchases made on the closing day itself already belong to the next statement.
  if (referenceDate < currentMonthCloseBoundary) {
    return {
      year,
      month,
      day: closingDay
    };
  }

  const nextMonthDate = new Date(year, month, 1, 12, 0, 0, 0);
  const nextYear = nextMonthDate.getFullYear();
  const nextMonth = nextMonthDate.getMonth() + 1;

  return {
    year: nextYear,
    month: nextMonth,
    day: clampDay(nextYear, nextMonth, closeDay)
  };
}

function getStatementMonthFromClosingDate(
  closing: { year: number; month: number },
  anchor: StatementMonthAnchor
) {
  const anchorDate = new Date(closing.year, closing.month - 1, 1, 12, 0, 0, 0);
  anchorDate.setMonth(anchorDate.getMonth() + getStatementMonthAnchorOffset(anchor));

  return formatStatementMonth(anchorDate.getFullYear(), anchorDate.getMonth() + 1);
}

function getClosingMonthDate(statementMonth: string, closeDay: number, anchor: StatementMonthAnchor) {
  const competenceMonthDate = getCompetenceMonthDate(statementMonth);
  const closingMonthDate = new Date(
    competenceMonthDate.getFullYear(),
    competenceMonthDate.getMonth() - getStatementMonthAnchorOffset(anchor),
    1,
    12,
    0,
    0,
    0
  );
  const year = closingMonthDate.getFullYear();
  const parsedMonth = closingMonthDate.getMonth() + 1;
  const closingDay = clampDay(year, parsedMonth, closeDay);

  return {
    year,
    month: parsedMonth,
    day: closingDay
  };
}

function getExpenseCompetenceMonth(
  card: Pick<CardStatementCard, "closeDay" | "dueDay" | "statementMonthAnchor">,
  referenceDate: Date
) {
  const nextClosing = getNextClosingDate(referenceDate, card.closeDay);
  return getStatementMonthFromClosingDate(nextClosing, card.statementMonthAnchor);
}

export function getCurrentStatementMonth(
  card: Pick<CardStatementCard, "closeDay" | "dueDay" | "statementMonthAnchor">,
  referenceDate = new Date()
) {
  return getExpenseCompetenceMonth(card, referenceDate);
}

export function getCurrentPayableStatementMonth(
  card: Pick<CardStatementCard, "closeDay" | "dueDay" | "statementMonthAnchor">,
  referenceDate = new Date()
) {
  const currentStatementMonth = getCurrentStatementMonth(card, referenceDate);
  const previousStatementMonth = addMonthsToStatementMonth(currentStatementMonth, -1);
  const previousDueDate = getStatementPaymentDate(
    previousStatementMonth,
    card.dueDay,
    card.closeDay,
    card.statementMonthAnchor
  );
  const dayReference = new Date(referenceDate);
  dayReference.setHours(0, 0, 0, 0);

  return previousDueDate >= dayReference ? previousStatementMonth : currentStatementMonth;
}

export function addMonthsToStatementMonth(month: string, amount: number) {
  const { year, month: parsedMonth } = parseStatementMonth(month);
  const shifted = new Date(year, parsedMonth - 1 + amount, 1, 12, 0, 0, 0);

  return formatStatementMonth(shifted.getFullYear(), shifted.getMonth() + 1);
}

export function getStatementRange(month: string, closeDay: number, statementMonthAnchor: StatementMonthAnchor) {
  const currentClose = getClosingMonthDate(month, closeDay, statementMonthAnchor);
  const previousStatementMonth = addMonthsToStatementMonth(month, -1);
  const previousClose = getClosingMonthDate(previousStatementMonth, closeDay, statementMonthAnchor);
  const currentCloseBoundary = new Date(currentClose.year, currentClose.month - 1, currentClose.day, 0, 0, 0, 0);

  return {
    start: new Date(previousClose.year, previousClose.month - 1, previousClose.day, 0, 0, 0, 0),
    end: new Date(currentCloseBoundary.getTime() - 1)
  };
}

export function getStatementPaymentDate(
  month: string,
  dueDay: number,
  closeDay: number,
  statementMonthAnchor: StatementMonthAnchor
) {
  const closing = getClosingMonthDate(month, closeDay, statementMonthAnchor);
  const dueMonthDate = new Date(
    closing.year,
    closing.month - 1 + getStatementMonthOffsetForDue(closeDay, dueDay),
    1,
    12,
    0,
    0,
    0
  );
  const dueYear = dueMonthDate.getFullYear();
  const dueMonth = dueMonthDate.getMonth() + 1;
  const paymentDay = clampDay(dueYear, dueMonth, dueDay);
  return new Date(dueYear, dueMonth - 1, paymentDay, 12, 0, 0, 0);
}

export function getStatementCloseDate(month: string, closeDay: number, statementMonthAnchor: StatementMonthAnchor) {
  const closing = getClosingMonthDate(month, closeDay, statementMonthAnchor);
  return new Date(closing.year, closing.month - 1, closing.day, 12, 0, 0, 0);
}

export function getCardExpenseDueDate(
  card: Pick<CardStatementCard, "closeDay" | "dueDay" | "statementMonthAnchor">,
  referenceDate: Date,
  installmentOffset = 0
) {
  return buildCardBillingSnapshot(card, referenceDate, installmentOffset).dueDate;
}

export function getCardExpenseCompetenceDate(
  card: Pick<CardStatementCard, "closeDay" | "dueDay" | "statementMonthAnchor">,
  referenceDate: Date
) {
  const competenceMonthKey = buildCardBillingSnapshot(card, referenceDate).competence;
  const competenceMonthDate = getCompetenceMonthDate(competenceMonthKey);
  const competenceYear = competenceMonthDate.getFullYear();
  const competenceMonth = competenceMonthDate.getMonth() + 1;
  const competenceDay = clampDay(competenceYear, competenceMonth, referenceDate.getDate());

  return new Date(competenceYear, competenceMonth - 1, competenceDay, 12, 0, 0, 0);
}

export function buildCardBillingSnapshot(
  card: Pick<CardStatementCard, "closeDay" | "dueDay" | "statementMonthAnchor">,
  referenceDate: Date,
  installmentOffset = 0
) {
  const baseStatementMonth = getExpenseCompetenceMonth(card, referenceDate);
  const competence = addMonthsToStatementMonth(baseStatementMonth, installmentOffset);

  return {
    competence,
    closeDate: getStatementCloseDate(competence, card.closeDay, card.statementMonthAnchor),
    dueDate: getStatementPaymentDate(competence, card.dueDay, card.closeDay, card.statementMonthAnchor)
  };
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

function calculatePaymentsTotal(payments: StatementPaymentLike[]) {
  return payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
}

function calculateStatementPaymentsTotal(payments: StatementPaymentLike[], statementMonth: string) {
  return calculatePaymentsTotal(payments.filter((payment) => payment.month === statementMonth));
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
  const statementMonth = month ?? getCurrentStatementMonth(card);
  const { start, end } = getStatementRange(statementMonth, card.closeDay, card.statementMonthAnchor);
  const [statementTransactions, allCardTransactions, payments] = await Promise.all([
    client.transaction.findMany({
      where: {
        tenantId,
        cardId: card.id,
        competence: statementMonth
      },
      select: {
        amount: true,
        type: true
      }
    }),
    client.transaction.findMany({
      where: {
        tenantId,
        cardId: card.id
      },
      select: {
        amount: true,
        type: true
      }
    }),
    client.statementPayment.findMany({
      where: {
        tenantId,
        cardId: card.id
      },
      select: {
        amount: true,
        month: true
      }
    })
  ]);
  const totalAmount = calculateStatementTotal(statementTransactions);
  const statementOutstandingAmount = Math.max(0, totalAmount - calculateStatementPaymentsTotal(payments, statementMonth));
  const outstandingAmount = Math.max(
    0,
    calculateStatementTotal(allCardTransactions) - calculatePaymentsTotal(payments)
  );

  return {
    month: statementMonth,
    start,
    end,
    totalAmount,
    statementOutstandingAmount,
    outstandingAmount,
    availableLimit: Number(card.limitAmount) - outstandingAmount,
    closeDate: getStatementCloseDate(statementMonth, card.closeDay, card.statementMonthAnchor),
    dueDate: getStatementPaymentDate(statementMonth, card.dueDay, card.closeDay, card.statementMonthAnchor)
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

  return Promise.all(
    cards.map((card) =>
      getCardStatementSnapshot({
        tenantId,
        card,
        month,
        client
      }).then((snapshot) => ({
        ...snapshot,
        card
      }))
    )
  );
}

export async function getNextPayableStatementSnapshot({
  tenantId,
  card,
  referenceDate = new Date(),
  client = prisma
}: {
  tenantId: string;
  card: CardStatementCard;
  referenceDate?: Date;
  client?: StatementClient;
}) {
  const currentStatementMonth = getCurrentStatementMonth(card, referenceDate);
  const candidateMonths = Array.from(
    new Set([
      addMonthsToStatementMonth(currentStatementMonth, -1),
      currentStatementMonth,
      addMonthsToStatementMonth(currentStatementMonth, 1)
    ])
  );
  const snapshots = await Promise.all(
    candidateMonths.map((month) =>
      getCardStatementSnapshot({
        tenantId,
        card,
        month,
        client
      })
    )
  );
  const referenceBoundary = new Date(referenceDate);
  referenceBoundary.setHours(0, 0, 0, 0);
  const payableSnapshots = snapshots
    .filter((snapshot) => snapshot.statementOutstandingAmount > 0)
    .sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime());

  const nextUpcoming = payableSnapshots.find((snapshot) => snapshot.dueDate >= referenceBoundary);

  return nextUpcoming ?? payableSnapshots[0] ?? snapshots.find((snapshot) => snapshot.month === currentStatementMonth) ?? snapshots[0];
}
