import { NextResponse } from "next/server";

import { syncDueSubscriptionTransactions } from "@/lib/automation/subscriptions";
import { requireSessionUser } from "@/lib/auth/session";
import { getFinanceReport } from "@/lib/finance/reports";
import { getMonthRange, normalizeMonthKey } from "@/lib/month";
import { captureRequestError } from "@/lib/observability/sentry";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    await syncDueSubscriptionTransactions({
      tenantId: user.tenantId,
      userId: user.id
    });
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");
    const resolvedMonth = month ? normalizeMonthKey(month) : null;
    const monthRange = resolvedMonth ? getMonthRange(resolvedMonth) : null;
    const report = await getFinanceReport(user.tenantId, {
      month: resolvedMonth, // Pass resolvedMonth to the new 'month' filter
      baseMonth: resolvedMonth, // Keep baseMonth for other internal logic if needed
      type: searchParams.get("type"),
      accountId: searchParams.get("accountId"),
      cardId: searchParams.get("cardId"),
      categoryId: searchParams.get("categoryId")
    });

    return NextResponse.json({
      ...report,
      isPlatformAdmin: user.isPlatformAdmin,
      license: {
        plan: user.license.plan,
        planLabel: user.license.planLabel,
        status: user.license.status,
        statusLabel: user.license.statusLabel,
        features: user.license.features
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    captureRequestError(error, { request, feature: "reports" });
    return NextResponse.json({ message: "Failed to load report summary" }, { status: 500 });
  }
}
