import { z } from "zod";

const dateKeyPattern = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function isRealDateKey(value: string) {
  if (!dateKeyPattern.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, 12, 0, 0, 0);

  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === (month ?? 1) - 1 &&
    parsed.getDate() === day
  );
}

export const dateKeySchema = z.string().refine(isRealDateKey, "Data invalida");
export const optionalDateKeySchema = z.preprocess(
  (value) => (value === "" ? null : value),
  dateKeySchema.optional().nullable()
);

export function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function normalizeCalendarDate(value: Date | string) {
  const source = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(source.getTime())) {
    return source;
  }

  return new Date(
    source.getUTCFullYear(),
    source.getUTCMonth(),
    source.getUTCDate(),
    12,
    0,
    0,
    0
  );
}

function toDisplayDate(value: Date | string) {
  if (typeof value !== "string") {
    return value;
  }

  const dateKey = value.slice(0, 10);
  if (isRealDateKey(dateKey)) {
    return new Date(`${dateKey}T12:00:00`);
  }

  return new Date(value);
}

export function formatDateDisplay(value: Date | string) {
  const date = toDisplayDate(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${day}/${month}/${year}`;
}

export function formatDateTimeDisplay(value: Date | string) {
  const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? toDisplayDate(value) : new Date(value);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${formatDateDisplay(date)} ${hours}:${minutes}`;
}

export function parseBrazilianDateToDateKey(value: string) {
  const trimmed = value.trim();

  if (dateKeyPattern.test(trimmed) && isRealDateKey(trimmed)) {
    return trimmed;
  }

  const match = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(trimmed);
  if (!match) {
    return null;
  }

  const [, day, month, year] = match;
  const dateKey = `${year}-${month}-${day}`;

  return isRealDateKey(dateKey) ? dateKey : null;
}
