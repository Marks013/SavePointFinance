import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

import { revalidateAdminUsers } from "@/lib/cache/admin-read-models";
import { serverEnv } from "@/lib/env/server";
import { captureRequestError } from "@/lib/observability/sentry";
import { prisma } from "@/lib/prisma/client";

export const runtime = "nodejs";

const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

type ResendWebhookEvent = {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    subject?: string;
    to?: string[];
    bounce?: {
      message?: string;
      subType?: string;
      type?: string;
    };
    complaint?: {
      feedbackType?: string;
      userAgent?: string;
    };
    tags?: Record<string, string>;
  };
};

function decodeSvixSecret(secret: string) {
  const normalized = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  return Buffer.from(normalized, "base64");
}

function verifyResendSignature(payload: string, headers: Headers) {
  if (!serverEnv.RESEND_WEBHOOK_SECRET) {
    throw new Error("RESEND_WEBHOOK_SECRET is not configured");
  }

  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatureHeader = headers.get("svix-signature");

  if (!id || !timestamp || !signatureHeader) {
    throw new Error("Missing Svix signature headers");
  }

  const timestampSeconds = Number(timestamp);

  if (!Number.isFinite(timestampSeconds)) {
    throw new Error("Invalid Svix timestamp");
  }

  const nowSeconds = Math.floor(Date.now() / 1000);

  if (Math.abs(nowSeconds - timestampSeconds) > SIGNATURE_TOLERANCE_SECONDS) {
    throw new Error("Expired Svix timestamp");
  }

  const signedPayload = `${id}.${timestamp}.${payload}`;
  const expected = createHmac("sha256", decodeSvixSecret(serverEnv.RESEND_WEBHOOK_SECRET))
    .update(signedPayload)
    .digest("base64");

  const signatures = signatureHeader
    .split(" ")
    .flatMap((part) => part.split(","))
    .filter((part) => part && part !== "v1");

  if (
    !signatures.some((signature) => {
      const expectedBuffer = Buffer.from(expected);
      const signatureBuffer = Buffer.from(signature);
      return expectedBuffer.length === signatureBuffer.length && timingSafeEqual(expectedBuffer, signatureBuffer);
    })
  ) {
    throw new Error("Invalid Svix signature");
  }

  return id;
}

function resolveEventDate(event: ResendWebhookEvent) {
  return event.created_at ? new Date(event.created_at) : new Date();
}

function resolveSupportStatus(event: ResendWebhookEvent) {
  switch (event.type) {
    case "email.delivered":
      return "delivered";
    case "email.bounced":
      return "bounced";
    case "email.complained":
      return "complained";
    case "email.delivery_delayed":
      return "delayed";
    case "email.sent":
      return "sent";
    default:
      return null;
  }
}

function resolveNotificationStatus(event: ResendWebhookEvent) {
  switch (event.type) {
    case "email.delivered":
    case "email.sent":
      return "sent";
    case "email.bounced":
    case "email.complained":
      return "failed";
    case "email.delivery_delayed":
      return "pending";
    default:
      return null;
  }
}

function resolveProviderError(event: ResendWebhookEvent) {
  if (event.type === "email.bounced") {
    return event.data?.bounce?.message ?? "E-mail retornou bounce no Resend.";
  }

  if (event.type === "email.complained") {
    return event.data?.complaint?.feedbackType
      ? `Reclamação registrada no Resend: ${event.data.complaint.feedbackType}`
      : "Reclamação registrada no Resend.";
  }

  if (event.type === "email.delivery_delayed") {
    return "Entrega atrasada pelo provedor.";
  }

  return null;
}

export async function POST(request: Request) {
  const payload = await request.text();

  try {
    const eventId = verifyResendSignature(payload, request.headers);
    const existing = await prisma.webhookEvent.findUnique({
      where: {
        eventId
      },
      select: {
        id: true,
        status: true
      }
    });

    if (existing?.status === "processed") {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    const event = JSON.parse(payload) as ResendWebhookEvent;
    const emailId = event.data?.email_id;

    await prisma.webhookEvent.upsert({
      where: {
        eventId
      },
      create: {
        provider: "RESEND",
        eventId,
        status: "processing",
        attempts: 1,
        payload: event
      },
      update: {
        status: "processing",
        attempts: {
          increment: 1
        },
        payload: event,
        error: null
      }
    });

    if (!emailId) {
      await prisma.webhookEvent.update({
        where: { eventId },
        data: {
          status: "ignored",
          processedAt: new Date()
        }
      });

      return NextResponse.json({ ok: true, ignored: true });
    }

    const eventAt = resolveEventDate(event);
    const providerError = resolveProviderError(event);
    const supportStatus = resolveSupportStatus(event);
    const notificationStatus = resolveNotificationStatus(event);

    const [supportTicket, notification] = await Promise.all([
      supportStatus
        ? prisma.supportTicket.updateMany({
            where: {
              providerMessageId: emailId
            },
            data: {
              deliveryStatus: supportStatus,
              providerError,
              updatedAt: new Date()
            }
          })
        : Promise.resolve({ count: 0 }),
      notificationStatus
        ? prisma.notificationDelivery.updateMany({
            where: {
              providerMessageId: emailId
            },
            data: {
              status: notificationStatus,
              providerEventStatus: event.type,
              providerEventAt: eventAt,
              errorMessage: providerError,
              deliveredAt: event.type === "email.delivered" ? eventAt : undefined
            }
          })
        : Promise.resolve({ count: 0 })
    ]);

    if (supportTicket.count > 0) {
      const ticket = await prisma.supportTicket.findFirst({
        where: {
          providerMessageId: emailId
        },
        select: {
          tenantId: true
        }
      });

      if (ticket) {
        revalidateAdminUsers(ticket.tenantId);
      }
    }

    await prisma.webhookEvent.update({
      where: { eventId },
      data: {
        status: "processed",
        error: supportTicket.count || notification.count ? null : `Nenhum registro local encontrado para ${emailId}`,
        processedAt: new Date()
      }
    });

    return NextResponse.json({
      ok: true,
      supportUpdated: supportTicket.count,
      notificationUpdated: notification.count
    });
  } catch (error) {
    let eventId: string | null = null;

    try {
      eventId = request.headers.get("svix-id");

      if (eventId) {
        await prisma.webhookEvent.upsert({
          where: { eventId },
          create: {
            provider: "RESEND",
            eventId,
            status: "failed",
            attempts: 1,
            payload: payload ? JSON.parse(payload) : undefined,
            error: error instanceof Error ? error.message : "Falha ao processar webhook Resend"
          },
          update: {
            status: "failed",
            attempts: {
              increment: 1
            },
            error: error instanceof Error ? error.message : "Falha ao processar webhook Resend"
          }
        });
      }
    } catch {
      // Avoid masking the original webhook error.
    }

    captureRequestError(error, { request, feature: "resend-webhook" });
    return NextResponse.json({ message: "Invalid or failed Resend webhook" }, { status: 400 });
  }
}
