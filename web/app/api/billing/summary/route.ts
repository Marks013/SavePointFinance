import { NextResponse } from "next/server";

import { captureRequestError } from "@/lib/observability/sentry";

import { getBillingOverviewForSession, toBillingRouteStatus } from "@/lib/billing/service";

export async function GET(request: Request) {
  try {
    const summary = await getBillingOverviewForSession();

    return NextResponse.json(summary);
  } catch (error) {
    captureRequestError(error, { request, feature: "billing-summary" });
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Failed to load billing summary"
      },
      { status: toBillingRouteStatus(error) }
    );
  }
}
