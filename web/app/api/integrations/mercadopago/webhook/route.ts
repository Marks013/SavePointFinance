import { after } from "next/server";
import { NextResponse } from "next/server";

import {
  enqueueMercadoPagoWebhookEvent,
  processQueuedMercadoPagoWebhookEvents
} from "@/lib/billing/async-processor";
import { toBillingRouteStatus } from "@/lib/billing/service";
import { captureRequestError } from "@/lib/observability/sentry";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const { searchParams } = new URL(request.url);
    const result = await enqueueMercadoPagoWebhookEvent({
      rawBody,
      headers: request.headers,
      searchParams
    });

    after(async () => {
      await processQueuedMercadoPagoWebhookEvents({
        eventIds: [result.eventId]
      }).catch((error) =>
        captureRequestError(error, {
          request,
          feature: "mercadopago-webhook",
          surface: "after"
        })
      );
    });

    return NextResponse.json({
      received: true,
      queued: true,
      deduped: result.deduped
    }, { status: result.deduped ? 200 : 202 });
  } catch (error) {
    captureRequestError(error, { request, feature: "mercadopago-webhook" });
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Failed to process Mercado Pago webhook"
      },
      { status: toBillingRouteStatus(error) }
    );
  }
}
