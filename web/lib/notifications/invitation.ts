import { buildPublicUrl } from "@/lib/app-url";
import { buildBrandedEmailTemplate } from "@/lib/notifications/email-template";

export function buildInvitationMessage(token: string, tenantName: string, userName?: string | null) {
  const inviteUrl = buildPublicUrl(`/accept-invitation?token=${token}`);
  const greeting = userName?.trim() ? `Olá, ${userName.trim()}.` : "Olá.";
  const intro = [
    greeting,
    "",
    `Você recebeu um convite para acessar a conta ${tenantName} no Save Point Finança.`,
    "Conclua o cadastro pelo link seguro abaixo para definir sua senha e entrar no painel."
  ].join("\n");
  const subject = `Convite para acessar ${tenantName}`;

  return {
    subject,
    message: [
      greeting,
      "",
      `Você recebeu um convite para acessar a conta ${tenantName} no Save Point Finança.`,
      "Use o link abaixo para concluir o cadastro e definir sua senha:",
      inviteUrl,
      "",
      "Este convite expira em 7 dias.",
      "Se você não esperava este convite, ignore esta mensagem."
    ].join("\n"),
    html: buildBrandedEmailTemplate({
      preheader: `Seu acesso para ${tenantName} está pronto para ativação.`,
      eyebrow: "Acesso por convite",
      title: "Seu convite para o Save Point chegou",
      intro,
      action: {
        label: "Aceitar convite",
        href: inviteUrl
      },
      details: [
        {
          label: "Conta",
          value: tenantName
        },
        {
          label: "Validade",
          value: "7 dias"
        }
      ],
      note: "Se você não esperava este convite, ignore esta mensagem. Nenhum acesso será criado sem a sua confirmação.",
      footer: "Este convite foi enviado pelo Save Point Finança para liberar acesso seguro ao painel."
    })
  };
}
