import { buildPublicUrl } from "@/lib/app-url";
import { buildBrandedEmailTemplate } from "@/lib/notifications/email-template";

export function buildPasswordResetMessage(token: string, userName?: string | null) {
  const resetUrl = buildPublicUrl(`/reset-password?token=${token}`);
  const greeting = userName?.trim() ? `Olá, ${userName.trim()}.` : "Olá.";
  const intro = [
    greeting,
    "",
    "Recebemos uma solicitação para redefinir a sua senha.",
    "Use o botão abaixo para criar uma nova senha com segurança."
  ].join("\n");
  const subject = "Redefinição de senha do Save Point Finance";

  return {
    subject,
    message: [
      greeting,
      "",
      "Recebemos uma solicitação para redefinir a sua senha.",
      "Use o link abaixo para criar uma nova senha:",
      resetUrl,
      "",
      "Este link expira em 24 horas.",
      "Se você não solicitou esta alteração, ignore esta mensagem."
    ].join("\n"),
    html: buildBrandedEmailTemplate({
      preheader: "Use este link seguro para criar uma nova senha.",
      eyebrow: "Segurança da conta",
      title: "Redefina sua senha",
      intro,
      action: {
        label: "Criar nova senha",
        href: resetUrl
      },
      details: [
        {
          label: "Validade",
          value: "24 horas"
        }
      ],
      note: "Se você não solicitou esta alteração, ignore esta mensagem. Sua senha atual continuará ativa.",
      footer: "Mensagem automática de segurança do Save Point Finance.",
      theme: "security"
    })
  };
}
