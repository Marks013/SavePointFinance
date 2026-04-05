import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number) {
  const normalized = Number.isFinite(value) ? value : 0;

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(normalized);
}

export function formatDateShort(value: Date | string | null | undefined) {
  if (!value) {
    return "Sem data";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short"
  }).format(new Date(value));
}

export function addMonthsClamped(baseDate: Date, amount: number) {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth() + amount;
  const day = baseDate.getDate();
  const hours = baseDate.getHours();
  const minutes = baseDate.getMinutes();
  const seconds = baseDate.getSeconds();
  const milliseconds = baseDate.getMilliseconds();

  const firstOfTargetMonth = new Date(year, month, 1, hours, minutes, seconds, milliseconds);
  const lastDayOfTargetMonth = new Date(year, month + 1, 0).getDate();

  firstOfTargetMonth.setDate(Math.min(day, lastDayOfTargetMonth));

  return firstOfTargetMonth;
}

export function splitAmountIntoInstallments(total: number, installments: number) {
  const normalizedTotal = Number.isFinite(total) ? total : 0;
  const normalizedInstallments = Math.max(1, Math.trunc(installments));
  const totalInCents = Math.round(normalizedTotal * 100);
  const baseInCents = Math.trunc(totalInCents / normalizedInstallments);
  const remainder = totalInCents - baseInCents * normalizedInstallments;

  return Array.from({ length: normalizedInstallments }, (_, index) => {
    const cents = baseInCents + (index < remainder ? 1 : 0);
    return cents / 100;
  });
}
