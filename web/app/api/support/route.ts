import { NextResponse } from "next/server";

import {
  supportPriorityLabels,
  supportRequestSchema,
  supportTopicLabels
} from "@/features/support/schemas/support-schema";
import { requireSessionUser } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env/server";
import { captureRequestError } from "@/lib/observability/sentry";

const SUPPORT_EMAIL_TIMEOUT_MS = 8_000;

function resolveEmailSender() {
  if (!serverEnv.EMAIL_FROM) {
    return null;
  }

  if (serverEnv.EMAIL_FROM_NAME) {
    return `${serverEnv.EMAIL_FROM_NAME} <${serverEnv.EMAIL_FROM}>`;
  }

  return serverEnv.EMAIL_FROM;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatMultiline(value: string) {
  return escapeHtml(value).replace(/\n/g, "<br />");
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort("support email timed out"), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildSupportHtml(input: {
  contactName: string;
  contactEmail: string;
  topic: string;
  priority: string;
  subject: string;
  message: string;
  context: Array<[string, string]>;
}) {
  const contextRows = input.context
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:8px 12px;color:#667085;border-bottom:1px solid #EAECF0;">${escapeHtml(label)}</td>
          <td style="padding:8px 12px;color:#101828;border-bottom:1px solid #EAECF0;">${escapeHtml(value)}</td>
        </tr>`
    )
    .join("");

  return `
    <div style="font-family:Inter,Arial,sans-serif;background:#F6F4EF;padding:28px;color:#101828;">
      <div style="max-width:680px;margin:0 auto;background:#FFFFFF;border:1px solid #E4DED4;border-radius:20px;overflow:hidden;">
        <div style="background:#123D35;color:#FFFFFF;padding:24px 28px;">
          <p style="margin:0 0 8px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#CDE8DD;">Save Point Finance</p>
          <h1 style="margin:0;font-size:24px;line-height:1.25;">Nova solicitação de suporte</h1>
        </div>
        <div style="padding:26px 28px;">
          <p style="margin:0 0 16px;color:#475467;">${escapeHtml(input.contactName)} enviou uma mensagem pelo módulo de suporte.</p>
          <table style="width:100%;border-collapse:collapse;margin:0 0 22px;border:1px solid #EAECF0;border-radius:12px;overflow:hidden;">
            <tbody>
              <tr>
                <td style="padding:8px 12px;color:#667085;border-bottom:1px solid #EAECF0;">Assunto</td>
                <td style="padding:8px 12px;color:#101828;border-bottom:1px solid #EAECF0;">${escapeHtml(input.subject)}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;color:#667085;border-bottom:1px solid #EAECF0;">Categoria</td>
                <td style="padding:8px 12px;color:#101828;border-bottom:1px solid #EAECF0;">${escapeHtml(input.topic)}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;color:#667085;border-bottom:1px solid #EAECF0;">Prioridade</td>
                <td style="padding:8px 12px;color:#101828;border-bottom:1px solid #EAECF0;">${escapeHtml(input.priority)}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;color:#667085;">Contato</td>
                <td style="padding:8px 12px;color:#101828;">${escapeHtml(input.contactEmail)}</td>
              </tr>
            </tbody>
          </table>
          <div style="padding:18px 20px;background:#F9FAFB;border:1px solid #EAECF0;border-radius:14px;line-height:1.7;">
            ${formatMultiline(input.message)}
          </div>
          ${
            contextRows
              ? `<h2 style="margin:24px 0 10px;font-size:16px;">Contexto</h2>
                 <table style="width:100%;border-collapse:collapse;border:1px solid #EAECF0;border-radius:12px;overflow:hidden;"><tbody>${contextRows}</tbody></table>`
              : ""
          }
        </div>
      </div>
    </div>`;
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = supportRequestSchema.parse(await request.json());
    const from = resolveEmailSender();
    const target = serverEnv.SUPPORT_EMAIL_TO ?? serverEnv.EMAIL_REPLY_TO;

    if (!serverEnv.RESEND_API_KEY || !from || !target) {
      return NextResponse.json(
        {
          message:
            "Suporte por e-mail ainda não está configurado. Defina RESEND_API_KEY, EMAIL_FROM e SUPPORT_EMAIL_TO."
        },
        { status: 503 }
      );
    }

    const topicLabel = supportTopicLabels[body.topic];
    const priorityLabel = supportPriorityLabels[body.priority];
    const context: Array<[string, string]> = body.allowAccountContext
      ? [
          ["Usuário", `${user.name ?? "Sem nome"} <${user.email ?? "sem e-mail"}>`],
          ["Conta", user.tenant?.name ?? user.tenantId],
          ["Papel", user.role],
          ["Plano", user.license.planLabel],
          ["Origem", request.headers.get("referer") ?? "/dashboard/support"]
        ]
      : [];
    const subject = `[${priorityLabel}] ${topicLabel}: ${body.subject}`;
    const text = [
      `Nova solicitação de suporte`,
      ``,
      `Assunto: ${body.subject}`,
      `Categoria: ${topicLabel}`,
      `Prioridade: ${priorityLabel}`,
      `Contato: ${body.contactName} <${body.contactEmail}>`,
      ``,
      body.message,
      ``,
      ...context.map(([label, value]) => `${label}: ${value}`)
    ].join("\n");
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
          to: [target],
          subject,
          text,
          html: buildSupportHtml({
            contactName: body.contactName,
            contactEmail: body.contactEmail,
            topic: topicLabel,
            priority: priorityLabel,
            subject: body.subject,
            message: body.message,
            context
          }),
          reply_to: body.contactEmail
        })
      },
      SUPPORT_EMAIL_TIMEOUT_MS
    );
    const payloadText = await response.text().catch(() => "");

    if (!response.ok) {
      let providerMessage = payloadText.trim();

      try {
        const payload = JSON.parse(payloadText) as { message?: string; error?: { message?: string } };
        providerMessage = payload.error?.message ?? payload.message ?? providerMessage;
      } catch {
        // Keep providerMessage as the plain response body.
      }

      return NextResponse.json(
        { message: providerMessage ? `Resend respondeu ${response.status}: ${providerMessage}` : "Falha ao enviar via Resend" },
        { status: 502 }
      );
    }

    let id: string | undefined;

    try {
      id = (JSON.parse(payloadText) as { id?: string }).id;
    } catch {
      id = undefined;
    }

    return NextResponse.json({ id, message: "Mensagem enviada ao suporte" });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    captureRequestError(error, { request, feature: "support" });
    return NextResponse.json({ message: "Failed to send support request" }, { status: 400 });
  }
}
