import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma/client";
import { captureUnexpectedError } from "@/lib/observability/sentry";
import { processIncomingWhatsAppTextMessage } from "@/lib/whatsapp/assistant";
import { buildCommandFromWhatsAppMedia } from "@/lib/whatsapp/media-understanding";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp/cloud-api";
import { sanitizeAssistantText } from "@/lib/whatsapp/text-sanitizer";
import { type WhatsAppWebhookPayload } from "@/lib/whatsapp/webhook-payload";

export type ProcessWhatsAppMessageAsyncInput = {
  eventId: string;
  phoneNumber: string | null;
  body: string | null;
  type: string | null;
  mediaId: string | null;
  mimeType: string | null;
  caption: string | null;
  payload: WhatsAppWebhookPayload;
};

const WHATSAPP_WEBHOOK_BATCH_SIZE = 10;
const WHATSAPP_WEBHOOK_MAX_ATTEMPTS = 5;
const WHATSAPP_WEBHOOK_STALE_PROCESSING_MINUTES = 15;
const WHATSAPP_WEBHOOK_RETRY_BASE_DELAY_SECONDS = 60;

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown webhook processing error";
}

function isNonRetryableWhatsAppDeliveryStatus(status: number) {
  if (status === 408 || status === 409 || status === 425 || status === 429) {
    return false;
  }

  return status >= 400 && status < 500;
}

async function markWebhookStatus(eventId: string, status: "SUCCESS", error?: string) {
  try {
    await prisma.$executeRaw`
      UPDATE "WebhookEvent"
      SET
        "status" = ${status},
        "error" = ${error ?? null},
        "nextAttemptAt" = NULL,
        "processedAt" = NOW(),
        "updatedAt" = NOW()
      WHERE "eventId" = ${eventId}
    `;
  } catch (updateError) {
    captureUnexpectedError(updateError, {
      surface: "webhook-status-update",
      route: "/api/integrations/whatsapp/webhook",
      operation: "POST",
      feature: "whatsapp",
      entityId: eventId,
      dedupeKey: `whatsapp:webhook-status:${eventId}`
    });
    console.error(`[WhatsApp] Failed to update webhook event ${eventId}`, updateError);
  }
}

async function markWebhookFailure(eventId: string, error?: string) {
  try {
    await prisma.$executeRaw`
      UPDATE "WebhookEvent"
      SET
        "status" = CASE
          WHEN "attempts" >= ${WHATSAPP_WEBHOOK_MAX_ATTEMPTS} THEN 'DEAD_LETTER'
          ELSE 'FAILED'
        END,
        "error" = ${error ?? null},
        "nextAttemptAt" = CASE
          WHEN "attempts" >= ${WHATSAPP_WEBHOOK_MAX_ATTEMPTS} THEN NULL
          ELSE NOW() + (${WHATSAPP_WEBHOOK_RETRY_BASE_DELAY_SECONDS} * POWER(2, GREATEST("attempts" - 1, 0)) * INTERVAL '1 second')
        END,
        "updatedAt" = NOW()
      WHERE "eventId" = ${eventId}
    `;
  } catch (updateError) {
    captureUnexpectedError(updateError, {
      surface: "webhook-failure-update",
      route: "/api/integrations/whatsapp/webhook",
      operation: "POST",
      feature: "whatsapp",
      entityId: eventId,
      dedupeKey: `whatsapp:webhook-failure:${eventId}`
    });
    console.error(`[WhatsApp] Failed to mark webhook event ${eventId} as failed`, updateError);
  }
}

async function markWebhookDeadLetter(eventId: string, error: string) {
  try {
    await prisma.$executeRaw`
      UPDATE "WebhookEvent"
      SET
        "status" = 'DEAD_LETTER',
        "error" = ${error},
        "nextAttemptAt" = NULL,
        "updatedAt" = NOW()
      WHERE "eventId" = ${eventId}
    `;
  } catch (updateError) {
    captureUnexpectedError(updateError, {
      surface: "webhook-dead-letter-update",
      route: "/api/integrations/whatsapp/webhook",
      operation: "POST",
      feature: "whatsapp",
      entityId: eventId,
      dedupeKey: `whatsapp:webhook-dead-letter:${eventId}`
    });
    console.error(`[WhatsApp] Failed to dead-letter webhook event ${eventId}`, updateError);
  }
}

function isQueuedWhatsAppMessage(value: unknown): value is ProcessWhatsAppMessageAsyncInput {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ProcessWhatsAppMessageAsyncInput>;

  return (
    typeof candidate.eventId === "string" &&
    candidate.eventId.trim().length > 0 &&
    (typeof candidate.phoneNumber === "string" || candidate.phoneNumber === null) &&
    (typeof candidate.body === "string" || candidate.body === null) &&
    (typeof candidate.type === "string" || candidate.type === null) &&
    (typeof candidate.mediaId === "string" || candidate.mediaId === null) &&
    (typeof candidate.mimeType === "string" || candidate.mimeType === null) &&
    (typeof candidate.caption === "string" || candidate.caption === null) &&
    Boolean(candidate.payload) &&
    typeof candidate.payload === "object"
  );
}

export async function enqueueWhatsAppMessage(input: ProcessWhatsAppMessageAsyncInput) {
  const insertedRows = await prisma.$executeRaw`
    INSERT INTO "WebhookEvent" (
      "id",
      "provider",
      "eventId",
      "status",
      "payload",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${randomUUID()},
      'WHATSAPP',
      ${input.eventId},
      'PENDING',
      CAST(${JSON.stringify(input)} AS jsonb),
      NOW(),
      NOW()
    )
    ON CONFLICT ("eventId") DO NOTHING
  `;

  if (insertedRows === 0) {
    console.info(`[WhatsApp] Duplicate queued webhook event ignored: ${input.eventId}`);
    return false;
  }

  return true;
}

async function claimWebhookEvent(eventId: string) {
  const touchedRows = await prisma.$executeRaw`
    UPDATE "WebhookEvent"
    SET
      "status" = 'PROCESSING',
      "error" = NULL,
      "attempts" = "attempts" + 1,
      "nextAttemptAt" = NULL,
      "updatedAt" = NOW()
    WHERE
      "eventId" = ${eventId}
      AND (
        "status" = 'PENDING'
        OR (
          "status" = 'FAILED'
          AND "attempts" < ${WHATSAPP_WEBHOOK_MAX_ATTEMPTS}
          AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= NOW())
        )
        OR (
          "status" = 'PROCESSING'
          AND "attempts" < ${WHATSAPP_WEBHOOK_MAX_ATTEMPTS}
          AND "updatedAt" < NOW() - (${WHATSAPP_WEBHOOK_STALE_PROCESSING_MINUTES} * INTERVAL '1 minute')
        )
      )
  `;

  if (touchedRows === 0) {
    console.info(`[WhatsApp] Duplicate in-flight or completed webhook event ignored: ${eventId}`);
    return false;
  }

  return true;
}

export async function processWhatsAppMessageAsync(input: ProcessWhatsAppMessageAsyncInput) {
  try {
    const acquiredLock = await claimWebhookEvent(input.eventId);

    if (!acquiredLock) {
      return;
    }

    if (!input.phoneNumber) {
      await markWebhookStatus(
        input.eventId,
        "SUCCESS",
        "Ignored webhook without a phone number."
      );
      return;
    }

    let result:
      | Awaited<ReturnType<typeof processIncomingWhatsAppTextMessage>>
      | {
          handled: true;
          to: string;
          response: string;
          logContext?: undefined;
        };

    if (input.type === "text" && input.body) {
      result = await processIncomingWhatsAppTextMessage({
        messageId: input.eventId,
        phoneNumber: input.phoneNumber,
        body: input.body
      });
    } else if ((input.type === "audio" || input.type === "image") && input.mediaId) {
      let mediaDraft:
        | Awaited<ReturnType<typeof buildCommandFromWhatsAppMedia>>
        | {
            ok: false;
            response: string;
          };

      try {
        mediaDraft = await buildCommandFromWhatsAppMedia({
          mediaId: input.mediaId,
          type: input.type,
          mimeType: input.mimeType,
          caption: input.caption
        });
      } catch (mediaError) {
        console.error(`[WhatsApp] Failed to analyze media for event ${input.eventId}`, mediaError);
        mediaDraft = {
          ok: false,
          response:
            input.type === "audio"
              ? "🎙️ Recebi seu áudio, mas não consegui transcrevê-lo agora. Tente reenviar ou mandar o lançamento em texto."
              : "🧾 Recebi sua imagem, mas não consegui ler o comprovante agora. Tente reenviar uma foto mais nítida ou mandar a descrição em texto."
        };
      }

      if (!mediaDraft.ok) {
        result = {
          handled: true,
          to: input.phoneNumber,
          response: mediaDraft.response
        };
      } else {
        const parsed = await processIncomingWhatsAppTextMessage({
          messageId: input.eventId,
          phoneNumber: input.phoneNumber,
          body: mediaDraft.command
        });

        result = {
          ...parsed,
          response: [
            input.type === "audio"
              ? `🎙️ Entendi seu áudio como: _${mediaDraft.command}_`
              : `🧾 Li seu comprovante como: _${mediaDraft.command}_`,
            "",
            parsed.response
          ].join("\n")
        };
      }
    } else {
      await markWebhookStatus(
        input.eventId,
        "SUCCESS",
        `Ignored webhook without supported payload. Type: ${input.type ?? "unknown"}`
      );
      return;
    }

    if (result.handled) {
      const sanitizedResponse = sanitizeAssistantText(result.response);
      const outboundIdempotencyKey = `outbound:${input.eventId}`;
      let outboundLogId: string | null = null;

      if (result.logContext) {
        try {
          const reservedLog = await prisma.whatsAppMessage.create({
            data: {
              tenantId: result.logContext.tenantId,
              userId: result.logContext.userId,
              phoneNumber: result.logContext.phoneNumber,
              direction: "outbound",
              idempotencyKey: outboundIdempotencyKey,
              messageId: null,
              body: sanitizedResponse,
              intent: result.logContext.intent,
              status: "sending",
              response: sanitizedResponse
            },
            select: {
              id: true
            }
          });
          outboundLogId = reservedLog.id;
        } catch (reserveError) {
          const existingLog = await prisma.whatsAppMessage.findUnique({
            where: {
              idempotencyKey: outboundIdempotencyKey
            },
            select: {
              id: true,
              status: true
            }
          });

          if (existingLog) {
            await markWebhookStatus(input.eventId, "SUCCESS", `Duplicate outbound response suppressed. Existing status: ${existingLog.status ?? "unknown"}`);
            return;
          }

          throw reserveError;
        }
      }

      const delivery = await sendWhatsAppTextMessage(result.to, sanitizedResponse);

      if (result.logContext && outboundLogId) {
        try {
          await prisma.whatsAppMessage.update({
            where: {
              id: outboundLogId
            },
            data: {
              messageId: delivery.messageId,
              status: delivery.ok ? "sent" : `failed:${delivery.status}`
            }
          });
        } catch (logError) {
          captureUnexpectedError(logError, {
            surface: "webhook-outbound-log",
            route: "/api/integrations/whatsapp/webhook",
            operation: "POST",
            feature: "whatsapp",
            entityId: input.eventId,
            dedupeKey: `whatsapp:webhook-outbound-log:${input.eventId}`
          });
          console.error(`[WhatsApp] Outbound log failed after send attempt for ${input.eventId}`, logError);
        }
      }

      if (!delivery.ok) {
        if (isNonRetryableWhatsAppDeliveryStatus(delivery.status)) {
          await markWebhookDeadLetter(input.eventId, `WhatsApp delivery rejected with non-retryable status ${delivery.status}.`);
          return;
        }

        await markWebhookFailure(input.eventId, `WhatsApp delivery failed with status ${delivery.status}.`);
        return;
      }
    }

    await markWebhookStatus(input.eventId, "SUCCESS");
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    captureUnexpectedError(error, {
      surface: "webhook-processing",
      route: "/api/integrations/whatsapp/webhook",
      operation: "POST",
      feature: "whatsapp",
      entityId: input.eventId,
      dedupeKey: `whatsapp:webhook:${input.eventId}`
    });
    console.error(`[WhatsApp] Failed to process webhook event ${input.eventId}`, error);
    if (input.eventId) {
      await markWebhookFailure(input.eventId, errorMessage);
    }
  }
}

export async function processQueuedWhatsAppWebhookEvents(options: { eventIds?: string[]; limit?: number } = {}) {
  const limit = options.limit ?? WHATSAPP_WEBHOOK_BATCH_SIZE;
  const events = await prisma.webhookEvent.findMany({
    where: {
      provider: "WHATSAPP",
      ...(options.eventIds?.length
        ? {
            eventId: {
              in: options.eventIds
            }
          }
        : {}),
      OR: [
        { status: "PENDING" },
        {
          status: "FAILED",
          attempts: {
            lt: WHATSAPP_WEBHOOK_MAX_ATTEMPTS
          },
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }]
        },
        {
          status: "PROCESSING",
          attempts: {
            lt: WHATSAPP_WEBHOOK_MAX_ATTEMPTS
          },
          updatedAt: {
            lt: new Date(Date.now() - WHATSAPP_WEBHOOK_STALE_PROCESSING_MINUTES * 60_000)
          }
        }
      ]
    },
    orderBy: {
      createdAt: "asc"
    },
    take: limit,
    select: {
      eventId: true,
      payload: true
    }
  });

  let processed = 0;
  let skipped = 0;

  for (const event of events) {
    if (!isQueuedWhatsAppMessage(event.payload)) {
      skipped += 1;
      await markWebhookDeadLetter(event.eventId, "Invalid queued WhatsApp webhook payload.");
      continue;
    }

    await processWhatsAppMessageAsync(event.payload);
    processed += 1;
  }

  return {
    queued: events.length,
    processed,
    skipped
  };
}
