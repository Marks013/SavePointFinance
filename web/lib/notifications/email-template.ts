type EmailAction = {
  label: string;
  href: string;
};

type EmailDetail = {
  label: string;
  value: string;
};

type EmailTemplateInput = {
  preheader: string;
  eyebrow: string;
  title: string;
  intro: string;
  action?: EmailAction;
  details?: EmailDetail[];
  note?: string;
  footer?: string;
};

const brand = {
  ink: "#13201a",
  muted: "#637268",
  cream: "#fff8ec",
  paper: "#fbf5ea",
  border: "#e2d2b7",
  emerald: "#136f4f",
  emeraldDark: "#0d4f39",
  coral: "#d97b55",
  gold: "#f1dfad"
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderParagraphs(value: string) {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 14px 0;color:${brand.ink};font-size:16px;line-height:1.72;">${escapeHtml(paragraph).replaceAll("\n", "<br />")}</p>`
    )
    .join("");
}

function renderDetails(details?: EmailDetail[]) {
  if (!details?.length) {
    return "";
  }

  const rows = details
    .map(
      (detail) => `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid rgba(19,111,79,0.12);color:${brand.muted};font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">${escapeHtml(detail.label)}</td>
          <td align="right" style="padding:12px 0;border-bottom:1px solid rgba(19,111,79,0.12);color:${brand.ink};font-size:14px;font-weight:700;">${escapeHtml(detail.value)}</td>
        </tr>`
    )
    .join("");

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 4px 0;border-collapse:collapse;">
      ${rows}
    </table>`;
}

function renderAction(action?: EmailAction) {
  if (!action) {
    return "";
  }

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 18px 0;">
      <tr>
        <td style="border-radius:999px;background:linear-gradient(135deg,${brand.emeraldDark} 0%,${brand.emerald} 68%,${brand.coral} 100%);box-shadow:0 16px 34px rgba(19,111,79,0.28);">
          <a href="${escapeHtml(action.href)}" style="display:inline-block;padding:15px 24px;border-radius:999px;color:#ffffff;font-size:15px;font-weight:800;text-decoration:none;letter-spacing:-0.01em;">${escapeHtml(action.label)}</a>
        </td>
      </tr>
    </table>
    <p style="margin:0;color:${brand.muted};font-size:12px;line-height:1.7;">Se o botão não abrir, use este link:<br /><a href="${escapeHtml(action.href)}" style="color:${brand.emerald};word-break:break-all;">${escapeHtml(action.href)}</a></p>`;
}

export function buildBrandedEmailTemplate({
  preheader,
  eyebrow,
  title,
  intro,
  action,
  details,
  note,
  footer
}: EmailTemplateInput) {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#162025;font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:radial-gradient(circle at top left,rgba(217,123,85,0.18),transparent 24%),radial-gradient(circle at top right,rgba(19,111,79,0.28),transparent 28%),linear-gradient(180deg,#0f171a 0%,#162025 100%);">
      <tr>
        <td align="center" style="padding:34px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;border-collapse:collapse;">
            <tr>
              <td style="padding:0 0 18px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                  <tr>
                    <td style="vertical-align:middle;">
                      <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                        <tr>
                          <td align="center" style="width:54px;height:54px;border-radius:20px;background:linear-gradient(145deg,#163229 0%,#1d6a4d 58%,#d97b55 100%);color:#ffffff;font-size:20px;font-weight:800;letter-spacing:-0.08em;box-shadow:0 18px 42px rgba(19,111,79,0.32);">S•</td>
                          <td style="padding-left:14px;">
                            <p style="margin:0;color:rgba(255,248,236,0.68);font-size:11px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;">Save Point Finança</p>
                            <p style="margin:4px 0 0 0;color:#fff8ec;font-size:19px;font-weight:800;letter-spacing:-0.04em;">Inteligência financeira diária</p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="overflow:hidden;border-radius:30px;background:${brand.paper};border:1px solid rgba(255,248,236,0.24);box-shadow:0 28px 80px rgba(0,0,0,0.30);">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                  <tr>
                    <td style="padding:34px 34px 22px 34px;background:radial-gradient(circle at top right,rgba(217,123,85,0.26),transparent 32%),linear-gradient(145deg,#fff8ec 0%,#f2e5cf 100%);">
                      <span style="display:inline-block;border-radius:999px;background:rgba(19,111,79,0.12);border:1px solid rgba(19,111,79,0.16);padding:8px 12px;color:${brand.emeraldDark};font-size:11px;font-weight:900;letter-spacing:0.14em;text-transform:uppercase;">${escapeHtml(eyebrow)}</span>
                      <h1 style="margin:20px 0 0 0;color:${brand.ink};font-size:34px;line-height:1.02;font-weight:800;letter-spacing:-0.06em;">${escapeHtml(title)}</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:30px 34px 34px 34px;">
                      ${renderParagraphs(intro)}
                      ${renderDetails(details)}
                      ${renderAction(action)}
                      ${
                        note
                          ? `<div style="margin-top:24px;border-radius:22px;border:1px solid rgba(19,111,79,0.16);background:#f3ead8;padding:16px 18px;color:${brand.emeraldDark};font-size:14px;font-weight:700;line-height:1.6;">${escapeHtml(note)}</div>`
                          : ""
                      }
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 8px 0 8px;">
                <p style="margin:0;color:rgba(255,248,236,0.62);font-size:12px;line-height:1.7;text-align:center;">${escapeHtml(footer ?? "Mensagem automática do Save Point Finança. Você pode revisar suas preferências de notificação no painel.")}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildGenericNotificationEmail(subject: string, message: string) {
  return buildBrandedEmailTemplate({
    preheader: message.split("\n").find(Boolean) ?? subject,
    eyebrow: "Notificação",
    title: subject,
    intro: message,
    note: "Abra o painel para revisar o contexto completo e atualizar suas preferências de automação."
  });
}
