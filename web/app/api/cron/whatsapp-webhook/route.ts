import { NextResponse } from "next/server";

import { serverEnv } from "@/lib/env/server";
import { captureRequestError } from "@/lib/observability/sentry";
import { processQueuedWhatsAppWebhookEvents } from "@/lib/whatsapp/async-processor";

function isAuthorized(request: Request) {
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null;
  const fallbackToken = request.headers.get("x-automation-secret");

  return bearerToken === serverEnv.AUTOMATION_CRON_SECRET || fallbackToken === serverEnv.AUTOMATION_CRON_SECRET;
}

async function runWhatsAppWebhookQueue(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const result = await processQueuedWhatsAppWebhookEvents();

    return NextResponse.json(result);
  } catch (error) {
    captureRequestError(error, { request, feature: "whatsapp-webhook", surface: "cron" });
    return NextResponse.json({ message: "Failed to process WhatsApp webhook queue" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return runWhatsAppWebhookQueue(request);
}

export async function POST(request: Request) {
  return runWhatsAppWebhookQueue(request);
}
