import assert from "node:assert/strict";

type IncomingWhatsAppWebhookMessage = {
  eventId: string;
  phoneNumber: string | null;
  body: string | null;
  type: string | null;
  mediaId: string | null;
  mimeType: string | null;
  caption: string | null;
};

type WhatsAppWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: Array<{
          wa_id?: string;
        }>;
        messages?: Array<{
          id?: string;
          from?: string;
          type?: string;
          text?: {
            body?: string;
          };
          image?: {
            id?: string;
            mime_type?: string;
            caption?: string;
          };
          audio?: {
            id?: string;
            mime_type?: string;
          };
        }>;
      };
    }>;
  }>;
};

function extractIncomingWhatsAppWebhookMessages(
  payload: WhatsAppWebhookPayload
): IncomingWhatsAppWebhookMessage[] {
  const dedupedMessages = new Map<string, IncomingWhatsAppWebhookMessage>();

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const fallbackPhoneNumber = value?.contacts?.[0]?.wa_id ?? null;

      for (const message of value?.messages ?? []) {
        if (!message.id) continue;

        dedupedMessages.set(message.id, {
          eventId: message.id,
          phoneNumber: message.from ?? fallbackPhoneNumber,
          body: message.text?.body?.trim() ?? null,
          type: message.type ?? null,
          mediaId: message.image?.id ?? message.audio?.id ?? null,
          mimeType: message.image?.mime_type ?? message.audio?.mime_type ?? null,
          caption: message.image?.caption?.trim() ?? null
        });
      }
    }
  }

  return [...dedupedMessages.values()];
}

const payload: WhatsAppWebhookPayload = {
  entry: [
    {
      changes: [
        {
          value: {
            contacts: [{ wa_id: "554499999999" }],
            messages: [
              {
                id: "img-1",
                type: "image",
                image: {
                  id: "media-image-123",
                  mime_type: "image/jpeg",
                  caption: "farmácia no PicPay"
                }
              },
              {
                id: "aud-1",
                from: "554488888888",
                type: "audio",
                audio: {
                  id: "media-audio-456",
                  mime_type: "audio/ogg"
                }
              }
            ]
          }
        }
      ]
    }
  ]
};

const messages = extractIncomingWhatsAppWebhookMessages(payload);

assert.equal(messages.length, 2);
assert.deepEqual(messages[0], {
  eventId: "img-1",
  phoneNumber: "554499999999",
  body: null,
  type: "image",
  mediaId: "media-image-123",
  mimeType: "image/jpeg",
  caption: "farmácia no PicPay"
});
assert.deepEqual(messages[1], {
  eventId: "aud-1",
  phoneNumber: "554488888888",
  body: null,
  type: "audio",
  mediaId: "media-audio-456",
  mimeType: "audio/ogg",
  caption: null
});

console.log("WhatsApp media audit passed.");
