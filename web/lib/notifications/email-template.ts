type EmailAction = {
  label: string;
  href: string;
};

type EmailDetail = {
  label: string;
  value: string;
};

type EmailTheme =
  | "generic"
  | "invitation"
  | "security"
  | "goal"
  | "billing"
  | "budget"
  | "report"
  | "retention";

type EmailTemplateInput = {
  preheader: string;
  eyebrow?: string;
  title: string;
  intro: string;
  action?: EmailAction;
  details?: EmailDetail[];
  note?: string;
  footer?: string;
  theme?: EmailTheme;
};

type EmailThemeConfig = {
  badge: string;
  accent: string;
  accentDark: string;
  noteBackground: string;
  noteInk: string;
  footer: string;
};

const brand = {
  ink: "#13201a",
  muted: "#637268",
  shellTop: "#0f171a",
  shellBottom: "#162025",
  cream: "#fff8ec",
  paper: "#fbf5ea",
  paperEdge: "#f2e5cf",
  borderSoft: "rgba(19,111,79,0.12)",
  emerald: "#136f4f",
  emeraldDark: "#0d4f39",
  coral: "#d97b55",
  white: "#ffffff"
};

const themes: Record<EmailTheme, EmailThemeConfig> = {
  generic: {
    badge: "Notificação",
    accent: brand.emerald,
    accentDark: brand.emeraldDark,
    noteBackground: "#f3ead8",
    noteInk: brand.emeraldDark,
    footer: "Mensagem automática do Save Point Finance."
  },
  invitation: {
    badge: "Convite seguro",
    accent: "#1f7a63",
    accentDark: "#145241",
    noteBackground: "#e7f5f0",
    noteInk: "#145241",
    footer: "Convite enviado com segurança pelo Save Point Finance."
  },
  security: {
    badge: "Segurança da conta",
    accent: "#c66143",
    accentDark: "#813524",
    noteBackground: "#fff0ea",
    noteInk: "#7d3524",
    footer: "Mensagem automática de segurança do Save Point Finance."
  },
  goal: {
    badge: "Metas",
    accent: "#2d8c60",
    accentDark: "#1d6240",
    noteBackground: "#ebf8ef",
    noteInk: "#1d6240",
    footer: "Resumo de metas preparado automaticamente pelo Save Point Finance."
  },
  billing: {
    badge: "Pagamentos",
    accent: "#cb684c",
    accentDark: "#8f4a35",
    noteBackground: "#fff1eb",
    noteInk: "#8f4a35",
    footer: "Resumo financeiro enviado automaticamente pelo Save Point Finance."
  },
  budget: {
    badge: "Orçamento",
    accent: "#b86a2a",
    accentDark: "#7d481e",
    noteBackground: "#fff4e8",
    noteInk: "#7d481e",
    footer: "Alerta automático de controle financeiro do Save Point Finance."
  },
  report: {
    badge: "Relatório",
    accent: "#2a7b73",
    accentDark: "#1d5752",
    noteBackground: "#e9f8f5",
    noteInk: "#1d5752",
    footer: "Relatório consolidado automaticamente pelo Save Point Finance."
  },
  retention: {
    badge: "Conta em atenção",
    accent: "#bf6548",
    accentDark: "#813524",
    noteBackground: "#fff4eb",
    noteInk: "#813524",
    footer: "Aviso automático sobre política de retenção do Save Point Finance."
  }
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function firstNonEmptyLine(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
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
          <td style="padding:12px 0;border-bottom:1px solid ${brand.borderSoft};color:${brand.muted};font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">${escapeHtml(detail.label)}</td>
          <td align="right" style="padding:12px 0;border-bottom:1px solid ${brand.borderSoft};color:${brand.ink};font-size:14px;font-weight:700;">${escapeHtml(detail.value)}</td>
        </tr>`
    )
    .join("");

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 4px 0;border-collapse:collapse;">
      ${rows}
    </table>`;
}

function renderAction(action: EmailAction | undefined, theme: EmailThemeConfig) {
  if (!action) {
    return "";
  }

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" class="email-cta-wrap" style="margin:28px 0 18px 0;">
      <tr>
        <td bgcolor="${theme.accentDark}" class="email-cta-shell" style="border-radius:999px;background:${theme.accentDark};background-color:${theme.accentDark};box-shadow:0 16px 34px rgba(19,111,79,0.28);">
          <a href="${escapeHtml(action.href)}" class="email-cta-link" style="display:inline-block;padding:15px 24px;border-radius:999px;background:linear-gradient(135deg,${theme.accentDark} 0%,${theme.accent} 68%,${brand.coral} 100%);color:${brand.white} !important;font-size:15px;font-weight:800;text-decoration:none;letter-spacing:-0.01em;text-shadow:0 1px 0 rgba(0,0,0,0.18);">
            ${escapeHtml(action.label)}
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0;color:${brand.muted};font-size:12px;line-height:1.7;">Se o botão não abrir, use este link:<br /><a href="${escapeHtml(action.href)}" style="color:${theme.accent};word-break:break-all;">${escapeHtml(action.href)}</a></p>`;
}

function inferTheme(subject: string, message: string): EmailTheme {
  const haystack = normalizeText(`${subject}\n${message}`);

  if (/(convite|acesso|compartilhamento|carteira pronta)/.test(haystack)) return "invitation";
  if (/(senha|seguranca|reset|redefin)/.test(haystack)) return "security";
  if (/(meta|marco|objetivo|vencimento da meta)/.test(haystack)) return "goal";
  if (/(fatura|assinatura|checkout|pagamento|cobranca|billing|cartao)/.test(haystack)) return "billing";
  if (/(orcamento|limite|gasto|categoria|uso alto|excedido|aumento forte)/.test(haystack)) return "budget";
  if (/(relatorio|resumo do periodo|mensal)/.test(haystack)) return "report";
  if (/(retencao|inatividade|trial|encerrad|risco)/.test(haystack)) return "retention";

  return "generic";
}

export function buildBrandedEmailTemplate({
  preheader,
  eyebrow,
  title,
  intro,
  action,
  details,
  note,
  footer,
  theme = "generic"
}: EmailTemplateInput) {
  const currentTheme = themes[theme];

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${escapeHtml(title)}</title>
    <style>
      body, table, td, p, a {
        font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif !important;
      }
      .email-page {
        background-color: ${brand.shellBottom} !important;
      }
      .email-shell,
      .email-content {
        background-color: ${brand.paper} !important;
      }
      .email-hero {
        background-color: ${brand.cream} !important;
      }
      .email-note {
        color: ${currentTheme.noteInk} !important;
      }
      .email-cta-link {
        color: ${brand.white} !important;
      }
      [data-ogsc] .email-page,
      [data-ogsb] .email-page {
        background-color: ${brand.shellBottom} !important;
      }
      [data-ogsc] .email-shell,
      [data-ogsb] .email-shell,
      [data-ogsc] .email-content,
      [data-ogsb] .email-content {
        background-color: ${brand.paper} !important;
      }
      [data-ogsc] .email-hero,
      [data-ogsb] .email-hero {
        background-color: ${brand.cream} !important;
      }
      [data-ogsc] .email-cta-shell,
      [data-ogsb] .email-cta-shell {
        background-color: ${currentTheme.accentDark} !important;
      }
      [data-ogsc] .email-cta-link,
      [data-ogsb] .email-cta-link {
        color: ${brand.white} !important;
        background: ${currentTheme.accentDark} !important;
      }
      @media (prefers-color-scheme: dark) {
        .email-page {
          background-color: ${brand.shellBottom} !important;
        }
        .email-shell,
        .email-content {
          background-color: ${brand.paper} !important;
        }
        .email-hero {
          background-color: ${brand.cream} !important;
        }
        .email-cta-shell,
        .email-cta-link {
          background-color: ${currentTheme.accentDark} !important;
          color: ${brand.white} !important;
        }
      }
    </style>
  </head>
  <body class="email-page" style="margin:0;padding:0;background:${brand.shellBottom};background-color:${brand.shellBottom};font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${brand.shellBottom}" class="email-page" style="width:100%;border-collapse:collapse;background:radial-gradient(circle at top left,rgba(217,123,85,0.18),transparent 24%),radial-gradient(circle at top right,rgba(19,111,79,0.28),transparent 28%),linear-gradient(180deg,${brand.shellTop} 0%,${brand.shellBottom} 100%);background-color:${brand.shellBottom};">
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
                          <td align="center" style="width:54px;height:54px;border-radius:20px;background:linear-gradient(145deg,#163229 0%,#1d6a4d 58%,#d97b55 100%);color:${brand.white};font-size:20px;font-weight:800;letter-spacing:-0.08em;box-shadow:0 18px 42px rgba(19,111,79,0.32);">S•</td>
                          <td style="padding-left:14px;">
                            <p style="margin:0;color:rgba(255,248,236,0.68);font-size:11px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;">Save Point Finance</p>
                            <p style="margin:4px 0 0 0;color:${brand.cream};font-size:19px;font-weight:800;letter-spacing:-0.04em;">Inteligência financeira diária</p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td bgcolor="${brand.paper}" class="email-shell" style="overflow:hidden;border-radius:30px;background:${brand.paper};background-color:${brand.paper};border:1px solid rgba(255,248,236,0.24);box-shadow:0 28px 80px rgba(0,0,0,0.30);">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                  <tr>
                    <td bgcolor="${brand.cream}" class="email-hero" style="padding:34px 34px 22px 34px;background:radial-gradient(circle at top right,rgba(217,123,85,0.26),transparent 32%),linear-gradient(145deg,${brand.cream} 0%,${brand.paperEdge} 100%);background-color:${brand.cream};">
                      <span style="display:inline-block;border-radius:999px;background:rgba(19,111,79,0.12);border:1px solid rgba(19,111,79,0.16);padding:8px 12px;color:${currentTheme.accentDark};font-size:11px;font-weight:900;letter-spacing:0.14em;text-transform:uppercase;">${escapeHtml(eyebrow ?? currentTheme.badge)}</span>
                      <h1 style="margin:20px 0 0 0;color:${brand.ink};font-size:34px;line-height:1.02;font-weight:800;letter-spacing:-0.06em;">${escapeHtml(title)}</h1>
                    </td>
                  </tr>
                  <tr>
                    <td bgcolor="${brand.paper}" class="email-content" style="padding:30px 34px 34px 34px;background:${brand.paper};background-color:${brand.paper};">
                      ${renderParagraphs(intro)}
                      ${renderDetails(details)}
                      ${renderAction(action, currentTheme)}
                      ${
                        note
                          ? `<div class="email-note" style="margin-top:24px;border-radius:22px;border:1px solid rgba(19,111,79,0.16);background:${currentTheme.noteBackground};background-color:${currentTheme.noteBackground};padding:16px 18px;color:${currentTheme.noteInk};font-size:14px;font-weight:700;line-height:1.6;">${escapeHtml(note)}</div>`
                          : ""
                      }
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 8px 0 8px;">
                <p style="margin:0;color:rgba(255,248,236,0.62);font-size:12px;line-height:1.7;text-align:center;">${escapeHtml(footer ?? currentTheme.footer)}</p>
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
  const theme = inferTheme(subject, message);
  const preheader = firstNonEmptyLine(message) ?? subject;

  return buildBrandedEmailTemplate({
    preheader,
    eyebrow: themes[theme].badge,
    title: subject,
    intro: message,
    note:
      theme === "budget"
        ? "Vale revisar a categoria e ajustar seu planejamento para evitar novos desvios."
        : theme === "billing"
          ? "Abra o painel para conferir o contexto completo e agir com antecedência."
          : theme === "goal"
            ? "Entre no painel para registrar o próximo passo e manter o progresso em movimento."
            : theme === "report"
              ? "Seu painel traz os detalhes do período, categorias e comparativos para aprofundar a leitura."
              : theme === "retention"
                ? "Acesse a conta o quanto antes para evitar impacto no seu histórico."
                : "Abra o painel para revisar o contexto completo e ajustar suas preferências de notificação.",
    theme
  });
}
