import { NotificationChannel, NotificationStatus } from "@prisma/client";

import { serverEnv } from "@/lib/env/server";
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
};

type DeliveryResult = {
  ok: boolean;
  skipped: boolean;
  status: number;
  error: string | null;
};

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

async function sendWithResend(input: NotificationInput) {
  const from = resolveEmailSender();

  if (!serverEnv.RESEND_API_KEY || !from) {
    return {
      ok: false,
      skipped: false,
      status: 0,
      error: "Resend nao configurado. Defina RESEND_API_KEY e EMAIL_FROM."
    } satisfies DeliveryResult;
  }

  const response = await fetch("https://api.resend.com/emails", {
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
      ...(serverEnv.EMAIL_REPLY_TO ? { reply_to: serverEnv.EMAIL_REPLY_TO } : {})
    })
  });

  return {
    ok: response.ok,
    skipped: false,
    status: response.status,
    error: response.ok ? null : `Resend respondeu ${response.status}`
  } satisfies DeliveryResult;
}

async function sendWithBrevo(input: NotificationInput) {
  const fromEmail = serverEnv.EMAIL_FROM;

  if (!serverEnv.BREVO_API_KEY || !fromEmail) {
    return {
      ok: false,
      skipped: false,
      status: 0,
      error: "Brevo nao configurado. Defina BREVO_API_KEY e EMAIL_FROM."
    } satisfies DeliveryResult;
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
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
      ...(serverEnv.EMAIL_REPLY_TO ? { replyTo: { email: serverEnv.EMAIL_REPLY_TO } } : {})
    })
  });

  return {
    ok: response.ok,
    skipped: false,
    status: response.status,
    error: response.ok ? null : `Brevo respondeu ${response.status}`
  } satisfies DeliveryResult;
}

async function sendViaWebhook(input: NotificationInput, attemptedAt: Date) {
  const webhookUrl = webhookForChannel(input.channel);

  if (!webhookUrl) {
    return {
      ok: false,
      skipped: true,
      status: 0,
      error: "Webhook nao configurado para este canal."
    } satisfies DeliveryResult;
  }

  const response = await fetch(webhookUrl, {
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
      attemptedAt: attemptedAt.toISOString()
    })
  });

  return {
    ok: response.ok,
    skipped: false,
    status: response.status,
    error: response.ok ? null : `Webhook respondeu ${response.status}`
  } satisfies DeliveryResult;
}

async function sendWithWhatsAppCloud(input: NotificationInput) {
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
        attemptedAt,
        deliveredAt: delivery.ok ? new Date() : null,
        errorMessage: delivery.ok ? null : delivery.error
      }
    });
  } catch (error) {
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
