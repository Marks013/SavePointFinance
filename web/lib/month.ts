const monthKeyPattern = /^\d{4}-\d{2}$/;

export function getCurrentMonthKey(referenceDate = new Date()) {
  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

export function isValidMonthKey(value: string | null | undefined): value is string {
  return Boolean(value && monthKeyPattern.test(value));
}

export function normalizeMonthKey(value: string | null | undefined, fallbackDate = new Date()) {
  return isValidMonthKey(value) ? value : getCurrentMonthKey(fallbackDate);
}

export function getMonthRange(monthKey: string) {
  const normalizedMonth = normalizeMonthKey(monthKey);
  const [year, month] = normalizedMonth.split("-").map(Number);
  const start = new Date(year, (month ?? 1) - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month ?? 1, 0, 23, 59, 59, 999);

  return {
    start,
    end,
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10)
  };
}

export function formatMonthKeyLabel(monthKey: string) {
  const normalizedMonth = normalizeMonthKey(monthKey);
  const [year, month] = normalizedMonth.split("-").map(Number);

  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric"
  }).format(new Date(year, (month ?? 1) - 1, 1));
}
