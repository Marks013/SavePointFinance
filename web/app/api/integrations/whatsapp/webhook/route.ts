import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma/client";
import { serverEnv } from "@/lib/env/server";
import { sendWhatsAppTextMessage, verifyWhatsAppSignature } from "@/lib/whatsapp/cloud-api";
import { processIncomingWhatsAppTextMessage } from "@/lib/whatsapp/assistant";

type WebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          id?: string;
          from?: string;
          type?: string;
          text?: {
            body?: string;
          };
        }>;
      };
    }>;
  }>;
};

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

  const payload = JSON.parse(rawBody) as WebhookPayload;
  const messages =
    payload.entry?.flatMap((entry) =>
      entry.changes?.flatMap((change) => change.value?.messages ?? []) ?? []
    ) ?? [];

  for (const message of messages) {
    if (message.type !== "text" || !message.from || !message.text?.body) {
      continue;
    }

    const result = await processIncomingWhatsAppTextMessage({
      messageId: message.id ?? null,
      phoneNumber: message.from,
      body: message.text.body
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
    }
  }

  return NextResponse.json({ received: true });
}
