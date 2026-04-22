import { NextResponse } from "next/server";

import { openBillingPortalForSession, toBillingRouteStatus } from "@/lib/billing/service";
import { captureRequestError } from "@/lib/observability/sentry";

export async function POST(request: Request) {
  try {
    const result = await openBillingPortalForSession();
    return NextResponse.json(result);
  } catch (error) {
    captureRequestError(error, { request, feature: "billing-portal" });
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Failed to open billing management"
      },
      { status: toBillingRouteStatus(error) }
    );
  }
}
