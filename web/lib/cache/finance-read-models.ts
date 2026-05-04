import { revalidateTag, unstable_cache } from "next/cache";

import { type FinanceReportFilters, getFinanceReport } from "@/lib/finance/reports";

function serializeReportFilters(filters: FinanceReportFilters, userId?: string) {
  return [
    userId ?? "",
    filters.month ?? "",
    filters.baseMonth ?? "",
    filters.from ?? "",
    filters.to ?? "",
    filters.type ?? "",
    filters.accountId ?? "",
    filters.cardId ?? "",
    filters.categoryId ?? ""
  ].join("|");
}

export function getFinanceReportsTag(tenantId: string) {
  return `tenant:${tenantId}:finance-reports`;
}

export async function getCachedFinanceReport(
  tenantId: string,
  filters: FinanceReportFilters,
  userId?: string
) {
  const cacheKey = serializeReportFilters(filters, userId);

  return unstable_cache(
    async () => getFinanceReport(tenantId, filters, userId),
    ["finance-report", tenantId, cacheKey],
    {
      tags: [getFinanceReportsTag(tenantId)]
    }
  )();
}

export function revalidateFinanceReports(tenantId: string) {
  try {
    revalidateTag(getFinanceReportsTag(tenantId), { expire: 0 });
  } catch {
    // Some CLI/audit scripts reuse domain functions outside the Next cache runtime.
  }
}
