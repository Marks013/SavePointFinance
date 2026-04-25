import { serverEnv } from "@/lib/env/server";

export const SUPPORT_EMAIL_TIMEOUT_MS = 8_000;
export const SUPPORT_RESPONSE_COPY =
  "Respondemos em até 24 horas em dias úteis. Mensagens abertas em domingos ou feriados entram no próximo dia útil.";

export type SupportEmailInput = {
  id: string;
  contactName: string;
  contactEmail: string;
  topicLabel: string;
  priorityLabel: string;
  subject: string;
  message: string;
  context: Array<[string, string]>;
};

export type SupportEmailResult =
  | {
      ok: true;
      providerMessageId?: string;
    }
  | {
      ok: false;
      status?: number;
      error: string;
    };

export function resolveSupportEmailSender() {
  if (!serverEnv.EMAIL_FROM) {
    return null;
  }

  if (serverEnv.EMAIL_FROM_NAME) {
    return `${serverEnv.EMAIL_FROM_NAME} <${serverEnv.EMAIL_FROM}>`;
  }

  return serverEnv.EMAIL_FROM;
}

export function resolveSupportEmailTarget() {
  return serverEnv.SUPPORT_EMAIL_TO ?? serverEnv.EMAIL_REPLY_TO ?? null;
}

export function isSupportEmailConfigured() {
  return Boolean(serverEnv.RESEND_API_KEY && resolveSupportEmailSender() && resolveSupportEmailTarget());
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

function buildSupportHtml(input: SupportEmailInput) {
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
                <td style="padding:8px 12px;color:#667085;border-bottom:1px solid #EAECF0;">Chamado</td>
                <td style="padding:8px 12px;color:#101828;border-bottom:1px solid #EAECF0;">${escapeHtml(input.id)}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;color:#667085;border-bottom:1px solid #EAECF0;">Assunto</td>
                <td style="padding:8px 12px;color:#101828;border-bottom:1px solid #EAECF0;">${escapeHtml(input.subject)}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;color:#667085;border-bottom:1px solid #EAECF0;">Categoria</td>
                <td style="padding:8px 12px;color:#101828;border-bottom:1px solid #EAECF0;">${escapeHtml(input.topicLabel)}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;color:#667085;border-bottom:1px solid #EAECF0;">Prioridade</td>
                <td style="padding:8px 12px;color:#101828;border-bottom:1px solid #EAECF0;">${escapeHtml(input.priorityLabel)}</td>
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

export async function sendSupportEmail(input: SupportEmailInput): Promise<SupportEmailResult> {
  const from = resolveSupportEmailSender();
  const target = resolveSupportEmailTarget();

  if (!serverEnv.RESEND_API_KEY || !from || !target) {
    return {
      ok: false,
      error: "RESEND_API_KEY, EMAIL_FROM ou SUPPORT_EMAIL_TO ausente."
    };
  }

  const subject = `[${input.priorityLabel}] ${input.topicLabel}: ${input.subject}`;
  const text = [
    "Nova solicitação de suporte",
    "",
    `Chamado: ${input.id}`,
    `Assunto: ${input.subject}`,
    `Categoria: ${input.topicLabel}`,
    `Prioridade: ${input.priorityLabel}`,
    `Contato: ${input.contactName} <${input.contactEmail}>`,
    "",
    input.message,
    "",
    ...input.context.map(([label, value]) => `${label}: ${value}`)
  ].join("\n");

  let response: Response;

  try {
    response = await fetchWithTimeout(
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
          html: buildSupportHtml(input),
          reply_to: input.contactEmail
        })
      },
      SUPPORT_EMAIL_TIMEOUT_MS
    );
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Falha de rede ao enviar via Resend"
    };
  }

  const payloadText = await response.text().catch(() => "");

  if (!response.ok) {
    let providerMessage = payloadText.trim();

    try {
      const payload = JSON.parse(payloadText) as { message?: string; error?: { message?: string } };
      providerMessage = payload.error?.message ?? payload.message ?? providerMessage;
    } catch {
      // Keep providerMessage as the plain response body.
    }

    return {
      ok: false,
      status: response.status,
      error: providerMessage ? `Resend ${response.status}: ${providerMessage}` : "Falha ao enviar via Resend"
    };
  }

  try {
    return {
      ok: true,
      providerMessageId: (JSON.parse(payloadText) as { id?: string }).id
    };
  } catch {
    return { ok: true };
  }
}
