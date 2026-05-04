import type { BillingWebhookEvent, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma/client";
import { captureUnexpectedError } from "@/lib/observability/sentry";

import {
  MERCADO_PAGO_PROVIDER,
  buildMercadoPagoWebhookDedupeKey,
  verifyMercadoPagoWebhookSignature
} from "./mercadopago";
import {
  BillingError,
  syncMercadoPagoPaymentById,
  syncMercadoPagoSubscriptionById
} from "./service";

type MercadoPagoWebhookPayload = {
  action?: string;
  data?: {
    id?: string | number;
  };
  id?: string | number;
  topic?: string;
  type?: string;
};

type BillingWebhookEnvelope = {
  topic: string;
  resourceId: string;
  action: string | null;
  payload: MercadoPagoWebhookPayload;
};

const BILLING_WEBHOOK_BATCH_SIZE = 10;
const BILLING_WEBHOOK_MAX_ATTEMPTS = 5;
const BILLING_WEBHOOK_STALE_PROCESSING_MINUTES = 15;
const BILLING_WEBHOOK_RETRY_BASE_DELAY_SECONDS = 60;

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown billing webhook processing error";
}

export function getBillingWebhookRetryDelayMs(attempt: number) {
  return BILLING_WEBHOOK_RETRY_BASE_DELAY_SECONDS * 1000 * 2 ** Math.max(attempt - 1, 0);
}

export function extractMercadoPagoWebhookEnvelope(input: {
  payload: MercadoPagoWebhookPayload;
  searchParams: URLSearchParams;
}): BillingWebhookEnvelope {
  const topic =
    input.payload.type ??
    input.payload.topic ??
    input.searchParams.get("type") ??
    input.searchParams.get("topic") ??
    "subscription_preapproval";
  const resourceId = String(
    input.payload.data?.id ??
      input.payload.id ??
      input.searchParams.get("data.id") ??
      input.searchParams.get("id") ??
      ""
  ).trim();

  if (!resourceId) {
    throw new BillingError("Webhook do Mercado Pago sem resource id", 400);
  }

  return {
    topic,
    resourceId,
    action: input.payload.action ?? null,
    payload: input.payload
  };
}

async function markBillingWebhookProcessed(eventId: string, status: "processed" | "ignored", error?: string | null) {
  await prisma.billingWebhookEvent.update({
    where: {
      id: eventId
    },
    data: {
      status,
      error: error ?? null,
      nextAttemptAt: null,
      processedAt: new Date()
    }
  });
}

async function markBillingWebhookFailure(eventId: string, attempts: number, error: string) {
  const shouldDeadLetter = attempts >= BILLING_WEBHOOK_MAX_ATTEMPTS;

  await prisma.billingWebhookEvent.update({
    where: {
      id: eventId
    },
    data: {
      status: shouldDeadLetter ? "dead_letter" : "failed",
      error,
      nextAttemptAt: shouldDeadLetter ? null : new Date(Date.now() + getBillingWebhookRetryDelayMs(attempts))
    }
  });
}

async function claimBillingWebhookEvent(eventId: string) {
  const touchedRows = await prisma.$executeRaw`
    UPDATE "BillingWebhookEvent"
    SET
      "status" = 'processing',
      "attempts" = "attempts" + 1,
      "error" = NULL,
      "nextAttemptAt" = NULL,
      "updatedAt" = NOW()
    WHERE
      "id" = ${eventId}
      AND (
        "status" = 'pending'
        OR (
          "status" = 'failed'
          AND "attempts" < ${BILLING_WEBHOOK_MAX_ATTEMPTS}
          AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= NOW())
        )
        OR (
          "status" = 'processing'
          AND "attempts" < ${BILLING_WEBHOOK_MAX_ATTEMPTS}
          AND "updatedAt" < NOW() - (${BILLING_WEBHOOK_STALE_PROCESSING_MINUTES} * INTERVAL '1 minute')
        )
      )
  `;

  return touchedRows > 0;
}

function isMercadoPagoWebhookPayload(value: Prisma.JsonValue | null): value is MercadoPagoWebhookPayload {
  return Boolean(value) && typeof value === "object";
}

async function processBillingWebhookRecord(event: Pick<BillingWebhookEvent, "id" | "topic" | "resourceId" | "attempts" | "payload">) {
  try {
    const claimed = await claimBillingWebhookEvent(event.id);

    if (!claimed) {
      return {
        skipped: true
      };
    }

    if (!isMercadoPagoWebhookPayload(event.payload)) {
      await markBillingWebhookFailure(event.id, event.attempts + 1, "Invalid Mercado Pago webhook payload.");
      return {
        failed: true
      };
    }

    if (event.topic.includes("payment")) {
      const payment = await syncMercadoPagoPaymentById(event.resourceId);

      if (!payment) {
        await markBillingWebhookProcessed(event.id, "ignored", "Payment mapping not found");
        return {
          ignored: true
        };
      }
    } else {
      const subscription = await syncMercadoPagoSubscriptionById(event.resourceId);

      if (!subscription) {
        await markBillingWebhookProcessed(event.id, "ignored", "Subscription mapping not found");
        return {
          ignored: true
        };
      }
    }

    await markBillingWebhookProcessed(event.id, "processed");
    return {
      processed: true
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    captureUnexpectedError(error, {
      surface: "billing-webhook-processing",
      route: "/api/integrations/mercadopago/webhook",
      operation: "POST",
      feature: "billing",
      entityId: event.id,
      dedupeKey: `billing:webhook:${event.id}`
    });
    await markBillingWebhookFailure(event.id, event.attempts + 1, errorMessage);
    return {
      failed: true
    };
  }
}

export async function enqueueMercadoPagoWebhookEvent(input: {
  rawBody: string;
  headers: Headers;
  searchParams: URLSearchParams;
}) {
  const payload = JSON.parse(input.rawBody) as MercadoPagoWebhookPayload;
  const envelope = extractMercadoPagoWebhookEnvelope({
    payload,
    searchParams: input.searchParams
  });
  const dedupeKey = buildMercadoPagoWebhookDedupeKey(input.rawBody);
  const existingEvent = await prisma.billingWebhookEvent.findUnique({
    where: {
      dedupeKey
    }
  });

  if (existingEvent) {
    return {
      eventId: existingEvent.id,
      deduped: true,
      status: existingEvent.status
    };
  }

  const signature = verifyMercadoPagoWebhookSignature({
    resourceId: envelope.resourceId,
    xRequestId: input.headers.get("x-request-id"),
    xSignature: input.headers.get("x-signature")
  });

  const event = await prisma.billingWebhookEvent.create({
    data: {
      provider: MERCADO_PAGO_PROVIDER,
      topic: envelope.topic,
      resourceId: envelope.resourceId,
      action: envelope.action,
      requestId: signature.requestId,
      signatureTs: signature.signatureTs,
      dedupeKey,
      payload: payload as unknown as Prisma.InputJsonValue,
      status: signature.isValid ? "pending" : "ignored",
      error: signature.isValid ? null : "Invalid Mercado Pago webhook signature",
      nextAttemptAt: signature.isValid ? new Date() : null
    }
  });

  if (!signature.isValid) {
    throw new BillingError("Assinatura do webhook do Mercado Pago é inválida", 401);
  }

  return {
    eventId: event.id,
    deduped: false,
    status: event.status
  };
}

export async function processQueuedMercadoPagoWebhookEvents(options: { eventIds?: string[]; limit?: number } = {}) {
  const limit = options.limit ?? BILLING_WEBHOOK_BATCH_SIZE;
  const now = new Date();
  const events = await prisma.billingWebhookEvent.findMany({
    where: {
      provider: MERCADO_PAGO_PROVIDER,
      ...(options.eventIds?.length
        ? {
            id: {
              in: options.eventIds
            }
          }
        : {}),
      OR: [
        {
          status: "pending"
        },
        {
          status: "failed",
          attempts: {
            lt: BILLING_WEBHOOK_MAX_ATTEMPTS
          },
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }]
        },
        {
          status: "processing",
          attempts: {
            lt: BILLING_WEBHOOK_MAX_ATTEMPTS
          },
          updatedAt: {
            lt: new Date(Date.now() - BILLING_WEBHOOK_STALE_PROCESSING_MINUTES * 60_000)
          }
        }
      ]
    },
    orderBy: {
      createdAt: "asc"
    },
    take: limit,
    select: {
      id: true,
      topic: true,
      resourceId: true,
      attempts: true,
      payload: true
    }
  });

  let processed = 0;
  let failed = 0;
  let ignored = 0;
  let skipped = 0;

  for (const event of events) {
    const result = await processBillingWebhookRecord(event);

    if (result.processed) {
      processed += 1;
      continue;
    }

    if (result.ignored) {
      ignored += 1;
      continue;
    }

    if (result.failed) {
      failed += 1;
      continue;
    }

    skipped += 1;
  }

  return {
    queued: events.length,
    processed,
    failed,
    ignored,
    skipped
  };
}
