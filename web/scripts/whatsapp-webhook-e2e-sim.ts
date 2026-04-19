import assert from "node:assert/strict";

type MockResponseInit = {
  status?: number;
  headers?: Record<string, string>;
};

function jsonResponse(body: unknown, init: MockResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {})
    }
  });
}

function binaryResponse(bytes: Uint8Array, init: MockResponseInit = {}) {
  return new Response(Buffer.from(bytes) as BodyInit, { 
    status: init.status ?? 200,
    headers: {
      "content-type": init.headers?.["content-type"] ?? "application/octet-stream",
    }
  }); 
}

async function main() {
  process.env.GEMINI_ENABLED = "true";
  process.env.GEMINI_API_KEY = "test-gemini-key";
  process.env.GEMINI_MODEL = "gemini-2.5-flash";
  process.env.WHATSAPP_ASSISTANT_ENABLED = "true";
  process.env.WHATSAPP_VERIFY_TOKEN = "test-whatsapp-verify-token";
  process.env.WHATSAPP_ACCESS_TOKEN = "test-whatsapp-token";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "123456789";
  process.env.WHATSAPP_GRAPH_VERSION = "v22.0";
  process.env.WHATSAPP_APP_SECRET = "test-whatsapp-app-secret";
  process.env.DATABASE_URL ??= "postgresql://savepoint:savepoint@127.0.0.1:5432/savepoint";
  process.env.AUTH_SECRET ??= "test-auth-secret";
  process.env.AUTOMATION_CRON_SECRET ??= "test-automation-secret";

  const { extractIncomingWhatsAppWebhookMessages } = await import("../lib/whatsapp/webhook-payload");
  const { buildCommandFromWhatsAppMedia } = await import("../lib/whatsapp/media-understanding");
  const { sanitizeAssistantText } = await import("../lib/whatsapp/text-sanitizer");

  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (url.includes("graph.facebook.com") && url.endsWith("/media-image-123")) {
      return jsonResponse({
        id: "media-image-123",
        url: "https://download.local/media-image-123",
        mime_type: "image/jpeg",
        file_size: 2048
      });
    }

    if (url.includes("graph.facebook.com") && url.endsWith("/media-audio-456")) {
      return jsonResponse({
        id: "media-audio-456",
        url: "https://download.local/media-audio-456",
        mime_type: "audio/ogg",
        file_size: 4096
      });
    }

    if (url === "https://download.local/media-image-123") {
      return binaryResponse(new Uint8Array([255, 216, 255, 224]), {
        headers: {
          "content-type": "image/jpeg"
        }
      });
    }

    if (url === "https://download.local/media-audio-456") {
      return binaryResponse(new Uint8Array([79, 103, 103, 83]), {
        headers: {
          "content-type": "audio/ogg"
        }
      });
    }

    if (url.includes("generativelanguage.googleapis.com")) {
      const requestBody = (() => {
        if (typeof input === "string" || input instanceof URL) {
          return "";
        }

        return typeof input.body === "string" ? input.body : "";
      })();

      const parsed = requestBody ? JSON.parse(requestBody) : null;
      const promptText = parsed?.contents?.[0]?.parts?.[0]?.text ?? "";
      const isImage = promptText.includes("Leia a imagem como comprovante");

      const modelOutput = isImage
        ? {
            intent: "launch_request",
            command: "gastei 120,90 de farmácia",
            summary: "Comprovante de compra com valor visível.",
            confidence: 0.91
          }
        : {
            intent: "launch_request",
            command: "gastei 42,50 no mercado",
            summary: "Áudio com lançamento de despesa identificado.",
            confidence: 0.88
          };

      return jsonResponse({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify(modelOutput)
                }
              ]
            }
          }
        ]
      });
    }

    throw new Error(`Unhandled fetch in whatsapp-webhook-e2e-sim: ${url}`);
  }) as typeof globalThis.fetch;

  try {
    const textPayload = {
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ wa_id: "554499999999" }],
                messages: [
                  {
                    id: "wamid.text-001",
                    from: "554499999999",
                    type: "text",
                    text: {
                      body: "gastei 42,50 no mercado no PicPay"
                    }
                  }
                ]
              }
            }
          ]
        }
      ]
    };

    const imagePayload = {
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ wa_id: "554488888888" }],
                messages: [
                  {
                    id: "wamid.image-001",
                    type: "image",
                    image: {
                      id: "media-image-123",
                      mime_type: "image/jpeg",
                      caption: "farmácia no cartão PicPay 3x"
                    }
                  }
                ]
              }
            }
          ]
        }
      ]
    };

    const audioPayload = {
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ wa_id: "554477777777" }],
                messages: [
                  {
                    id: "wamid.audio-001",
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

    const parsedText = extractIncomingWhatsAppWebhookMessages(textPayload);
    const parsedImage = extractIncomingWhatsAppWebhookMessages(imagePayload);
    const parsedAudio = extractIncomingWhatsAppWebhookMessages(audioPayload);

    assert.equal(parsedText.length, 1);
    assert.equal(parsedText[0]?.type, "text");
    assert.equal(parsedText[0]?.body, "gastei 42,50 no mercado no PicPay");

    assert.equal(parsedImage.length, 1);
    assert.equal(parsedImage[0]?.type, "image");
    assert.equal(parsedImage[0]?.mediaId, "media-image-123");
    assert.equal(parsedImage[0]?.caption, "farmácia no cartão PicPay 3x");

    assert.equal(parsedAudio.length, 1);
    assert.equal(parsedAudio[0]?.type, "audio");
    assert.equal(parsedAudio[0]?.mediaId, "media-audio-456");

    const imageCommand = await buildCommandFromWhatsAppMedia({
      mediaId: parsedImage[0]!.mediaId!,
      type: "image",
      mimeType: parsedImage[0]!.mimeType,
      caption: parsedImage[0]!.caption
    });

    assert.equal(imageCommand.ok, true);
    assert.match(imageCommand.ok ? imageCommand.command : "", /cartão PicPay/i);
    assert.match(imageCommand.ok ? imageCommand.command : "", /\b3x\b/i);

    const audioCommand = await buildCommandFromWhatsAppMedia({
      mediaId: parsedAudio[0]!.mediaId!,
      type: "audio",
      mimeType: parsedAudio[0]!.mimeType,
      caption: parsedAudio[0]!.caption
    });

    assert.equal(audioCommand.ok, true);
    assert.match(audioCommand.ok ? audioCommand.command : "", /gastei 42,50/i);

    const sanitized = sanitizeAssistantText("âš ï¸ NÃ£o foi possÃ­vel lanÃ§ar o relatÃ³rio.");
    assert.equal(sanitized, "⚠️ Não foi possível lançar o relatório.");

    console.log("WHATSAPP_WEBHOOK_E2E_SIM_OK");
    console.log(
      JSON.stringify(
        {
          text: parsedText[0],
          imageCommand: imageCommand.command,
          audioCommand: audioCommand.command,
          sanitized
        },
        null,
        2
      )
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch((error) => {
  console.error("WHATSAPP_WEBHOOK_E2E_SIM_FAILED");
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
