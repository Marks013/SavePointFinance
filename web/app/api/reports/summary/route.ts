import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session";
import { getFinanceReport } from "@/lib/finance/reports";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const { searchParams } = new URL(request.url);
    const report = await getFinanceReport(user.tenantId, {
      from: searchParams.get("from"),
      to: searchParams.get("to"),
      type: searchParams.get("type"),
      accountId: searchParams.get("accountId"),
      cardId: searchParams.get("cardId"),
      categoryId: searchParams.get("categoryId")
    }, user.id);

    return NextResponse.json({
      ...report,
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

    return NextResponse.json({ message: "Failed to load report summary" }, { status: 500 });
  }
}
