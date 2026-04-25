import { NotificationChannel, NotificationStatus } from "@prisma/client";

import { serverEnv } from "@/lib/env/server";
import { buildGenericNotificationEmail } from "@/lib/notifications/email-template";
import { captureUnexpectedError } from "@/lib/observability/sentry";
import { prisma } from "@/lib/prisma/client";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp/cloud-api";

type NotificationInput = {
  tenantId: string;
  userId?: string | null;
  goalId?: string | null;
  channel: NotificationChannel;
  target: string;
  subject: string;
  message: string;
  html?: string;
};

type DeliveryResult = {
  ok: boolean;
  skipped: boolean;
  status: number;
  error: string | null;
  providerMessageId?: string | null;
};

const EMAIL_DELIVERY_TIMEOUT_MS = 8_000;
const WEBHOOK_DELIVERY_TIMEOUT_MS = 8_000;

function resolveEmailSender() {
  if (!serverEnv.EMAIL_FROM) {
    return null;
  }

  if (serverEnv.EMAIL_FROM_NAME) {
    return `${serverEnv.EMAIL_FROM_NAME} <${serverEnv.EMAIL_FROM}>`;
  }

  return serverEnv.EMAIL_FROM;
}

function webhookForChannel(channel: NotificationChannel) {
  if (channel === NotificationChannel.email) {
    return serverEnv.NOTIFICATION_EMAIL_WEBHOOK_URL;
  }

  return serverEnv.NOTIFICATION_WHATSAPP_WEBHOOK_URL;
}

function buildEmailHtml(input: NotificationInput) {
  return input.html ?? buildGenericNotificationEmail(input.subject, input.message);
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  timeoutLabel: string
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(`${timeoutLabel} timed out after ${timeoutMs}ms`), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`${timeoutLabel} excedeu ${Math.round(timeoutMs / 1000)}s`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function sendWithResend(input: NotificationInput): Promise<DeliveryResult> {
  const from = resolveEmailSender();

  if (!serverEnv.RESEND_API_KEY || !from) {
    return {
      ok: false,
      skipped: false,
      status: 0,
      error: "Resend nao configurado. Defina RESEND_API_KEY e EMAIL_FROM."
    } satisfies DeliveryResult;
  }

  const response = await fetchWithTimeout(
    "https://api.resend.com/emails",
    {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serverEnv.RESEND_API_KEY}`
    },
    body: JSON.stringify({
      from,
      to: [input.target],
      subject: input.subject,
      text: input.message,
      html: buildEmailHtml(input),
      ...(serverEnv.EMAIL_REPLY_TO ? { reply_to: serverEnv.EMAIL_REPLY_TO } : {})
    })
    },
    EMAIL_DELIVERY_TIMEOUT_MS,
    "Entrega de e-mail via Resend"
  );

  const payloadText = await response.text().catch(() => "");
  let providerError: string | null = null;
  let providerMessageId: string | null = null;

  try {
    const payload = JSON.parse(payloadText) as { id?: string; message?: string; error?: { message?: string } };

    if (response.ok) {
      providerMessageId = payload.id ?? null;
    } else {
      providerError = payload.error?.message ?? payload.message ?? null;
    }
  } catch {
    providerError = response.ok ? null : payloadText.trim() || null;
  }

  return {
    ok: response.ok,
    skipped: false,
    status: response.status,
    error: response.ok ? null : providerError ? `Resend respondeu ${response.status}: ${providerError}` : `Resend respondeu ${response.status}`,
    providerMessageId
  } satisfies DeliveryResult;
}

async function sendWithBrevo(input: NotificationInput): Promise<DeliveryResult> {
  const fromEmail = serverEnv.EMAIL_FROM;

  if (!serverEnv.BREVO_API_KEY || !fromEmail) {
    return {
      ok: false,
      skipped: false,
      status: 0,
      error: "Brevo nao configurado. Defina BREVO_API_KEY e EMAIL_FROM."
    } satisfies DeliveryResult;
  }

  const response = await fetchWithTimeout(
    "https://api.brevo.com/v3/smtp/email",
    {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": serverEnv.BREVO_API_KEY
    },
    body: JSON.stringify({
      sender: {
        email: fromEmail,
        ...(serverEnv.EMAIL_FROM_NAME ? { name: serverEnv.EMAIL_FROM_NAME } : {})
      },
      to: [{ email: input.target }],
      subject: input.subject,
      textContent: input.message,
      htmlContent: buildEmailHtml(input),
      ...(serverEnv.EMAIL_REPLY_TO ? { replyTo: { email: serverEnv.EMAIL_REPLY_TO } } : {})
    })
    },
    EMAIL_DELIVERY_TIMEOUT_MS,
    "Entrega de e-mail via Brevo"
  );

  return {
    ok: response.ok,
    skipped: false,
    status: response.status,
    error: response.ok ? null : `Brevo respondeu ${response.status}`
  } satisfies DeliveryResult;
}

async function sendViaWebhook(input: NotificationInput, attemptedAt: Date): Promise<DeliveryResult> {
  const webhookUrl = webhookForChannel(input.channel);

  if (!webhookUrl) {
    return {
      ok: false,
      skipped: true,
      status: 0,
      error: "Webhook nao configurado para este canal."
    } satisfies DeliveryResult;
  }

  const response = await fetchWithTimeout(
    webhookUrl,
    {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      channel: input.channel,
      tenantId: input.tenantId,
      userId: input.userId,
      goalId: input.goalId,
      target: input.target,
      subject: input.subject,
      message: input.message,
      html: input.channel === NotificationChannel.email ? buildEmailHtml(input) : undefined,
      attemptedAt: attemptedAt.toISOString()
    })
    },
    WEBHOOK_DELIVERY_TIMEOUT_MS,
    "Entrega via webhook"
  );

  return {
    ok: response.ok,
    skipped: false,
    status: response.status,
    error: response.ok ? null : `Webhook respondeu ${response.status}`
  } satisfies DeliveryResult;
}

async function sendWithWhatsAppCloud(input: NotificationInput): Promise<DeliveryResult> {
  if (
    serverEnv.WHATSAPP_ASSISTANT_ENABLED !== "true" ||
    !serverEnv.WHATSAPP_ACCESS_TOKEN ||
    !serverEnv.WHATSAPP_PHONE_NUMBER_ID
  ) {
    return {
      ok: false,
      skipped: false,
      status: 0,
      error: "WhatsApp Cloud API nao configurada. Defina o token, o numero e ative a integração."
    } satisfies DeliveryResult;
  }

  const response = await sendWhatsAppTextMessage(input.target, `${input.subject}\n\n${input.message}`);

  return {
    ok: response.ok,
    skipped: false,
    status: response.status,
    error: response.ok ? null : "Falha ao entregar via WhatsApp Cloud API."
  } satisfies DeliveryResult;
}

export async function deliverNotification(input: NotificationInput) {
  const attemptedAt = new Date();

  try {
    const delivery =
      input.channel === NotificationChannel.email && serverEnv.EMAIL_PROVIDER === "resend"
        ? await sendWithResend(input)
        : input.channel === NotificationChannel.email && serverEnv.EMAIL_PROVIDER === "brevo"
          ? await sendWithBrevo(input)
          : input.channel === NotificationChannel.whatsapp
            ? await sendWithWhatsAppCloud(input)
            : await sendViaWebhook(input, attemptedAt);

    return prisma.notificationDelivery.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId ?? null,
        goalId: input.goalId ?? null,
        channel: input.channel,
        status: delivery.skipped
          ? NotificationStatus.skipped
          : delivery.ok
            ? NotificationStatus.sent
            : NotificationStatus.failed,
        target: input.target,
        subject: input.subject,
        message: input.message,
        responseCode: delivery.status || null,
        providerMessageId: delivery.providerMessageId ?? null,
        providerEventStatus: delivery.ok ? "email.sent" : null,
        providerEventAt: delivery.ok ? attemptedAt : null,
        attemptedAt,
        deliveredAt: delivery.ok ? new Date() : null,
        errorMessage: delivery.ok ? null : delivery.error
      }
    });
  } catch (error) {
    captureUnexpectedError(error, {
      surface: "notification-delivery",
      feature: "notifications",
      tenantId: input.tenantId,
      userId: input.userId ?? null,
      entityId: input.goalId ?? null,
      tags: {
        channel: input.channel
      },
      dedupeKey: `notification-delivery:${input.channel}:${input.tenantId}`
    });

    return prisma.notificationDelivery.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId ?? null,
        goalId: input.goalId ?? null,
        channel: input.channel,
        status: NotificationStatus.failed,
        target: input.target,
        subject: input.subject,
        message: input.message,
        attemptedAt,
        errorMessage: error instanceof Error ? error.message : "Falha desconhecida"
      }
    });
  }
}
