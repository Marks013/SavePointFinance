import { after, NextResponse } from "next/server";

import { serverEnv } from "@/lib/env/server";
import { captureUnexpectedError } from "@/lib/observability/sentry";
import { processWhatsAppMessageAsync } from "@/lib/whatsapp/async-processor";
import { verifyWhatsAppSignature } from "@/lib/whatsapp/cloud-api";
import {
  extractIncomingWhatsAppWebhookMessages,
  type WhatsAppWebhookPayload
} from "@/lib/whatsapp/webhook-payload";

export async function GET(request: Request) {
  if (serverEnv.WHATSAPP_ASSISTANT_ENABLED !== "true") {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    challenge &&
    serverEnv.WHATSAPP_VERIFY_TOKEN &&
    token === serverEnv.WHATSAPP_VERIFY_TOKEN
  ) {
    return new Response(challenge, { status: 200 });
  }

  return NextResponse.json({ message: "Forbidden" }, { status: 403 });
}

export async function POST(request: Request) {
  if (serverEnv.WHATSAPP_ASSISTANT_ENABLED !== "true") {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  const rawBody = await request.text();
  if (!verifyWhatsAppSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ message: "Invalid signature" }, { status: 401 });
  }

  let payload: WhatsAppWebhookPayload;

  try {
    payload = JSON.parse(rawBody) as WhatsAppWebhookPayload;
  } catch (error) {
    console.error("[WhatsApp] Webhook payload parse error", error);
    return NextResponse.json({ error: "invalid payload" }, { status: 200 });
  }

  const messages = extractIncomingWhatsAppWebhookMessages(payload);

  if (!messages.length) {
    return NextResponse.json({ status: "ignored" }, { status: 200 });
  }

  after(async () => {
    try {
      const processingResults = await Promise.allSettled(
        messages.map((message) =>
          processWhatsAppMessageAsync({
            eventId: message.eventId,
            phoneNumber: message.phoneNumber,
            body: message.body,
            type: message.type,
            payload
          })
        )
      );

      for (const [index, result] of processingResults.entries()) {
        if (result.status === "rejected") {
          captureUnexpectedError(result.reason, {
            surface: "webhook-after",
            route: "/api/integrations/whatsapp/webhook",
            operation: "POST",
            feature: "whatsapp",
            entityId: messages[index]?.eventId ?? null,
            dedupeKey: `whatsapp:webhook:rejected:${messages[index]?.eventId ?? index}`
          });
          console.error(
            `[WhatsApp] Fatal async error for webhook event ${messages[index]?.eventId ?? "unknown"}`,
            result.reason
          );
        }
      }
    } catch (error) {
      captureUnexpectedError(error, {
        surface: "webhook-after",
        route: "/api/integrations/whatsapp/webhook",
        operation: "POST",
        feature: "whatsapp",
        dedupeKey: "whatsapp:webhook:after"
      });
      console.error("[WhatsApp] Unhandled after() failure", error);
    }
  });

  return NextResponse.json({ status: "received" }, { status: 200 });
}
