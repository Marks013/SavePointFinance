import { NextResponse } from "next/server";

import { cancelBillingSubscriptionForSession, toBillingRouteStatus } from "@/lib/billing/service";
import { captureRequestError } from "@/lib/observability/sentry";

export async function POST(request: Request) {
  try {
    const result = await cancelBillingSubscriptionForSession();
    return NextResponse.json(result);
  } catch (error) {
    captureRequestError(error, { request, feature: "billing-cancel" });
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Failed to cancel billing subscription"
      },
      { status: toBillingRouteStatus(error) }
    );
  }
}
