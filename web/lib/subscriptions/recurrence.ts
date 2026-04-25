function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function getSubscriptionBillingDate(year: number, monthIndex: number, billingDay: number) {
  const day = Math.min(Math.max(billingDay, 1), daysInMonth(year, monthIndex));
  return new Date(year, monthIndex, day, 12, 0, 0, 0);
}

export function advanceSubscriptionBillingDate(referenceDate: Date, billingDay: number, monthOffset = 1) {
  const targetMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + monthOffset, 1, 12, 0, 0, 0);
  return getSubscriptionBillingDate(targetMonth.getFullYear(), targetMonth.getMonth(), billingDay);
}

export function isBeforeCurrentSubscriptionMonth(value: Date, now = new Date()) {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  return value < monthStart;
}
