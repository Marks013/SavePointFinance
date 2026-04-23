import { buildPublicUrl } from "@/lib/app-url";
import { buildBrandedEmailTemplate } from "@/lib/notifications/email-template";

type InvitationMessageKind = "shared_wallet" | "admin_isolated";

export function buildInvitationMessage(
  token: string,
  tenantName: string,
  userName?: string | null,
  kind: InvitationMessageKind = "shared_wallet"
) {
  const inviteUrl = buildPublicUrl(`/accept-invitation?token=${token}`);
  const greeting = userName?.trim() ? `Olá, ${userName.trim()}.` : "Olá.";
  const isIsolatedInvite = kind === "admin_isolated";

  const subject = isIsolatedInvite
    ? `Sua nova carteira no Save Point está pronta: ${tenantName}`
    : `Convite para compartilhar a carteira ${tenantName}`;

  const intro = isIsolatedInvite
    ? [
        greeting,
        "",
        `Sua nova carteira ${tenantName} já foi preparada no Save Point Finance.`,
        "Conclua a ativação pelo link seguro abaixo para criar sua senha e entrar no painel."
      ].join("\n")
    : [
        greeting,
        "",
        `Você recebeu um convite para participar da carteira ${tenantName} no Save Point Finance.`,
        "Use o acesso seguro abaixo para criar sua senha e entrar no ambiente compartilhado."
      ].join("\n");

  const message = isIsolatedInvite
    ? [
        greeting,
        "",
        `Sua nova carteira ${tenantName} já foi preparada no Save Point Finance.`,
        "Use o link abaixo para ativar o acesso e definir sua senha:",
        inviteUrl,
        "",
        "Este convite expira em 7 dias.",
        "Se você não esperava esta criação de conta, ignore esta mensagem."
      ].join("\n")
    : [
        greeting,
        "",
        `Você recebeu um convite para compartilhar a carteira ${tenantName} no Save Point Finance.`,
        "Use o link abaixo para concluir o cadastro e definir sua senha:",
        inviteUrl,
        "",
        "Este convite expira em 7 dias.",
        "Se você não esperava este convite, ignore esta mensagem."
      ].join("\n");

  return {
    subject,
    message,
    html: buildBrandedEmailTemplate({
      preheader: isIsolatedInvite
        ? `Sua carteira ${tenantName} está pronta para ativação.`
        : `Seu acesso compartilhado para ${tenantName} está pronto para ativação.`,
      eyebrow: isIsolatedInvite ? "Nova carteira" : "Compartilhamento",
      title: isIsolatedInvite ? "Ative sua nova carteira" : "Aceite o convite para compartilhar",
      intro,
      action: {
        label: isIsolatedInvite ? "Ativar minha carteira" : "Aceitar convite",
        href: inviteUrl
      },
      details: [
        {
          label: "Carteira",
          value: tenantName
        },
        {
          label: "Validade",
          value: "7 dias"
        }
      ],
      note: isIsolatedInvite
        ? "Se você não esperava esta conta, ignore esta mensagem. Nenhum acesso será ativado sem a sua confirmação."
        : "Se você não esperava este convite, ignore esta mensagem. Nenhum acesso será criado sem a sua confirmação.",
      footer: isIsolatedInvite
        ? "Convite enviado para ativação de uma carteira dedicada no Save Point Finance."
        : "Convite enviado para compartilhar uma carteira com segurança no Save Point Finance.",
      theme: "invitation"
    })
  };
}
