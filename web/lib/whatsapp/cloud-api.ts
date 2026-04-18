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

type WhatsAppMediaMetadata = {
  id: string;
  url: string;
  mime_type?: string;
  sha256?: string;
  file_size?: number;
};

function ensureWhatsAppMediaEnv() {
  if (
    serverEnv.WHATSAPP_ASSISTANT_ENABLED !== "true" ||
    !serverEnv.WHATSAPP_ACCESS_TOKEN ||
    !serverEnv.WHATSAPP_PHONE_NUMBER_ID
  ) {
    throw new Error("WhatsApp Cloud API não está configurada para mídia.");
  }
}

export async function getWhatsAppMediaMetadata(mediaId: string) {
  ensureWhatsAppMediaEnv();

  const response = await fetch(
    `https://graph.facebook.com/${serverEnv.WHATSAPP_GRAPH_VERSION}/${mediaId}`,
    {
      headers: {
        Authorization: `Bearer ${serverEnv.WHATSAPP_ACCESS_TOKEN}`
      }
    }
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Falha ao consultar mídia do WhatsApp (${response.status}): ${errorText || "sem detalhes"}`
    );
  }

  const payload = (await response.json()) as WhatsAppMediaMetadata;

  if (!payload.url) {
    throw new Error("A mídia do WhatsApp não retornou URL de download.");
  }

  return payload;
}

export async function downloadWhatsAppMedia(mediaId: string) {
  const metadata = await getWhatsAppMediaMetadata(mediaId);
  const response = await fetch(metadata.url, {
    headers: {
      Authorization: `Bearer ${serverEnv.WHATSAPP_ACCESS_TOKEN}`
    }
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Falha ao baixar mídia do WhatsApp (${response.status}): ${errorText || "sem detalhes"}`
    );
  }

  const bytes = Buffer.from(await response.arrayBuffer());

  return {
    bytes,
    mimeType: metadata.mime_type ?? response.headers.get("content-type") ?? "application/octet-stream",
    fileSize: metadata.file_size ?? bytes.byteLength
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
