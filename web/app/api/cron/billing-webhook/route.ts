import { NextResponse } from "next/server";

import { processQueuedMercadoPagoWebhookEvents } from "@/lib/billing/async-processor";
import { serverEnv } from "@/lib/env/server";
import { captureRequestError } from "@/lib/observability/sentry";

function isAuthorized(request: Request) {
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null;
  const fallbackToken = request.headers.get("x-automation-secret");

  return bearerToken === serverEnv.AUTOMATION_CRON_SECRET || fallbackToken === serverEnv.AUTOMATION_CRON_SECRET;
}

async function runBillingWebhookQueue(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const result = await processQueuedMercadoPagoWebhookEvents();
    return NextResponse.json(result);
  } catch (error) {
    captureRequestError(error, { request, feature: "billing-webhook", surface: "cron" });
    return NextResponse.json({ message: "Failed to process billing webhook queue" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return runBillingWebhookQueue(request);
}

export async function POST(request: Request) {
  return runBillingWebhookQueue(request);
}
