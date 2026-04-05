import { z } from "zod";

export const statementMonthSchema = z.string().regex(/^\d{4}-\d{2}$/, "Competencia invalida");

function parseStatementMonth(month: string) {
  const [yearValue, monthValue] = statementMonthSchema.parse(month).split("-");
  return {
    year: Number(yearValue),
    month: Number(monthValue)
  };
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
