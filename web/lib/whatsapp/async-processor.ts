import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma/client";
import { captureUnexpectedError } from "@/lib/observability/sentry";
import { processIncomingWhatsAppTextMessage } from "@/lib/whatsapp/assistant";
import { buildCommandFromWhatsAppMedia } from "@/lib/whatsapp/media-understanding";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp/cloud-api";
import { sanitizeAssistantText } from "@/lib/whatsapp/text-sanitizer";
import { type WhatsAppWebhookPayload } from "@/lib/whatsapp/webhook-payload";

type ProcessWhatsAppMessageAsyncInput = {
  eventId: string;
  phoneNumber: string | null;
  body: string | null;
  type: string | null;
  mediaId: string | null;
  mimeType: string | null;
  caption: string | null;
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
  try {
    const acquiredLock = await createWebhookLock(input.eventId, input.payload);

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
      const delivery = await sendWhatsAppTextMessage(result.to, sanitizedResponse);

      if (result.logContext) {
        await prisma.whatsAppMessage.create({
          data: {
            tenantId: result.logContext.tenantId,
            userId: result.logContext.userId,
            phoneNumber: result.logContext.phoneNumber,
            direction: "outbound",
            messageId: delivery.messageId,
            body: sanitizedResponse,
            intent: result.logContext.intent,
            status: delivery.ok ? "sent" : `failed:${delivery.status}`,
            response: sanitizedResponse
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
      await markWebhookStatus(input.eventId, "FAILED", errorMessage);
    }
  }
}
