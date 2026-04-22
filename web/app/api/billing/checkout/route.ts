import { NextResponse } from "next/server";

import { startBillingCheckoutForSession, toBillingRouteStatus } from "@/lib/billing/service";
import { captureRequestError } from "@/lib/observability/sentry";

export async function POST(request: Request) {
  try {
    const result = await startBillingCheckoutForSession();
    return NextResponse.json(result);
  } catch (error) {
    captureRequestError(error, { request, feature: "billing-checkout" });
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Failed to start billing checkout"
      },
      { status: toBillingRouteStatus(error) }
    );
  }
}
