import { NextResponse } from "next/server";

import { runRecurringAutomation } from "@/lib/automation/subscriptions";
import { requireSessionUser } from "@/lib/auth/session";
import { revalidateFinanceReports } from "@/lib/cache/finance-read-models";
import { captureRequestError } from "@/lib/observability/sentry";
import { prisma } from "@/lib/prisma/client";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser({ feature: "automation" });
    const now = new Date();
    const reminderWindow = new Date();
    reminderWindow.setDate(reminderWindow.getDate() + 7);

    const [dueSubscriptions, upcomingGoals] = await Promise.all([
      prisma.subscription.count({
        where: {
          tenantId: user.tenantId,
          isActive: true,
          nextBillingDate: {
            lte: now
          }
        }
      }),
      prisma.goal.count({
        where: {
          tenantId: user.tenantId,
          isCompleted: false,
          deadline: {
            gte: now,
            lte: reminderWindow
          }
        }
      })
    ]);

    return NextResponse.json({
      dueSubscriptions,
      upcomingGoals
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    captureRequestError(error, { request, feature: "automation" });
    return NextResponse.json({ message: "Failed to load automation summary" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser({ feature: "automation" });
    const result = await runRecurringAutomation(user.tenantId, user.id);
    revalidateFinanceReports(user.tenantId);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    captureRequestError(error, { request, feature: "automation" });
    return NextResponse.json({ message: "Failed to run automation" }, { status: 400 });
  }
}
