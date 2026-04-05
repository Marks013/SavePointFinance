import { NextResponse } from "next/server";

import { generateSubscriptionTransaction } from "@/lib/automation/subscriptions";
import { requireSessionUser } from "@/lib/auth/session";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await context.params;
    const result = await generateSubscriptionTransaction(id, user.tenantId, user.id);

    return NextResponse.json({
      transactionId: result.transactionId,
      duplicated: result.duplicated,
      nextBillingDate: result.nextBillingDate
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message === "Subscription not found") {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }

    return NextResponse.json({ message: "Failed to generate transaction" }, { status: 400 });
  }
}
