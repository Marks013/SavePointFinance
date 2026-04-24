import { NextResponse } from "next/server";

import { createAnnualBillingPaymentForSession, toBillingRouteStatus } from "@/lib/billing/service";
import { captureRequestError } from "@/lib/observability/sentry";

export async function POST(request: Request) {
  try {
    const result = await createAnnualBillingPaymentForSession();
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    captureRequestError(error, { request, feature: "billing-create-annual-payment" });
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Failed to create annual billing payment"
      },
      { status: toBillingRouteStatus(error) }
    );
  }
}
