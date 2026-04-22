import { NextResponse } from "next/server";

import { getBillingOverviewForSession, toBillingRouteStatus } from "@/lib/billing/service";
import { captureRequestError } from "@/lib/observability/sentry";

export async function GET(request: Request) {
  try {
    const overview = await getBillingOverviewForSession();
    return NextResponse.json(overview);
  } catch (error) {
    captureRequestError(error, { request, feature: "billing-overview" });
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Failed to load billing overview"
      },
      { status: toBillingRouteStatus(error) }
    );
  }
}
