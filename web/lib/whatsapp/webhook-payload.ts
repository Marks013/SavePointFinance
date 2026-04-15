export type WhatsAppWebhookPayload = {
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
        }>;
      };
    }>;
  }>;
};

export type IncomingWhatsAppWebhookMessage = {
  eventId: string;
  phoneNumber: string | null;
  body: string | null;
  type: string | null;
};

export function extractIncomingWhatsAppWebhookMessages(
  payload: WhatsAppWebhookPayload
): IncomingWhatsAppWebhookMessage[] {
  const dedupedMessages = new Map<string, IncomingWhatsAppWebhookMessage>();

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const fallbackPhoneNumber = value?.contacts?.[0]?.wa_id ?? null;

      for (const message of value?.messages ?? []) {
        if (!message.id) {
          continue;
        }

        dedupedMessages.set(message.id, {
          eventId: message.id,
          phoneNumber: message.from ?? fallbackPhoneNumber,
          body: message.text?.body?.trim() ?? null,
          type: message.type ?? null
        });
      }
    }
  }

  return [...dedupedMessages.values()];
}
