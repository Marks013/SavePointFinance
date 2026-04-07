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
