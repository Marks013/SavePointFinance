import { createHmac, timingSafeEqual } from "node:crypto";

import { serverEnv } from "@/lib/env/server";

export async function sendWhatsAppTextMessage(to: string, body: string) {
  if (
    serverEnv.WHATSAPP_ASSISTANT_ENABLED !== "true" ||
    !serverEnv.WHATSAPP_ACCESS_TOKEN ||
    !serverEnv.WHATSAPP_PHONE_NUMBER_ID
  ) {
    return {
      ok: false,
      status: 503,
      messageId: null
    };
  }

  const response = await fetch(
    `https://graph.facebook.com/${serverEnv.WHATSAPP_GRAPH_VERSION}/${serverEnv.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serverEnv.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: {
          preview_url: false,
          body
        }
      })
    }
  );

  const payload = (await response.json().catch(() => null)) as
    | {
        messages?: Array<{ id?: string }>;
      }
    | null;

  return {
    ok: response.ok,
    status: response.status,
    messageId: payload?.messages?.[0]?.id ?? null
  };
}

export function verifyWhatsAppSignature(rawBody: string, signatureHeader: string | null) {
  if (!serverEnv.WHATSAPP_APP_SECRET) {
    return true;
  }

  if (!signatureHeader?.startsWith("sha256=")) {
    return false;
  }

  const expected = Buffer.from(signatureHeader);
  const computed = Buffer.from(
    `sha256=${createHmac("sha256", serverEnv.WHATSAPP_APP_SECRET).update(rawBody).digest("hex")}`
  );

  if (expected.length !== computed.length) {
    return false;
  }

  return timingSafeEqual(expected, computed);
}
