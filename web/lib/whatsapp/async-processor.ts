import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma/client";
import { processIncomingWhatsAppTextMessage } from "@/lib/whatsapp/assistant";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp/cloud-api";
import { type WhatsAppWebhookPayload } from "@/lib/whatsapp/webhook-payload";

type ProcessWhatsAppMessageAsyncInput = {
  eventId: string;
  phoneNumber: string | null;
  body: string | null;
  type: string | null;
  payload: WhatsAppWebhookPayload;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown webhook processing error";
}

async function markWebhookStatus(eventId: string, status: "SUCCESS" | "FAILED", error?: string) {
  try {
    await prisma.$executeRaw`
      UPDATE "WebhookEvent"
      SET
        "status" = ${status},
        "error" = ${error ?? null},
        "updatedAt" = NOW()
      WHERE "eventId" = ${eventId}
    `;
  } catch (updateError) {
    console.error(`[WhatsApp] Failed to update webhook event ${eventId}`, updateError);
  }
}

async function createWebhookLock(eventId: string, payload: WhatsAppWebhookPayload) {
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
      ${eventId},
      'PROCESSING',
      CAST(${JSON.stringify(payload)} AS jsonb),
      NOW(),
      NOW()
    )
    ON CONFLICT ("eventId") DO NOTHING
  `;

  if (insertedRows === 0) {
    console.info(`[WhatsApp] Duplicate webhook event ignored: ${eventId}`);
    return false;
  }

  return true;
}

export async function processWhatsAppMessageAsync(input: ProcessWhatsAppMessageAsyncInput) {
  const acquiredLock = await createWebhookLock(input.eventId, input.payload);

  if (!acquiredLock) {
    return;
  }

  if (input.type !== "text" || !input.phoneNumber || !input.body) {
    await markWebhookStatus(
      input.eventId,
      "SUCCESS",
      "Ignored webhook without a supported text message payload."
    );
    return;
  }

  try {
    const result = await processIncomingWhatsAppTextMessage({
      messageId: input.eventId,
      phoneNumber: input.phoneNumber,
      body: input.body
    });

    if (result.handled) {
      const delivery = await sendWhatsAppTextMessage(result.to, result.response);

      if (result.logContext) {
        await prisma.whatsAppMessage.create({
          data: {
            tenantId: result.logContext.tenantId,
            userId: result.logContext.userId,
            phoneNumber: result.logContext.phoneNumber,
            direction: "outbound",
            messageId: delivery.messageId,
            body: result.response,
            intent: result.logContext.intent,
            status: delivery.ok ? "sent" : `failed:${delivery.status}`,
            response: result.response
          }
        });
      }

      if (!delivery.ok) {
        await markWebhookStatus(
          input.eventId,
          "FAILED",
          `WhatsApp delivery failed with status ${delivery.status}.`
        );
        return;
      }
    }

    await markWebhookStatus(input.eventId, "SUCCESS");
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    console.error(`[WhatsApp] Failed to process webhook event ${input.eventId}`, error);
    await markWebhookStatus(input.eventId, "FAILED", errorMessage);
  }
}
