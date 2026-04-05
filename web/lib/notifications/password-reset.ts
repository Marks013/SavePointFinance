import { buildPublicUrl } from "@/lib/app-url";

export function buildPasswordResetMessage(token: string, userName?: string | null) {
  const resetUrl = buildPublicUrl(`/reset-password?token=${token}`);
  const greeting = userName?.trim() ? `Olá, ${userName.trim()}.` : "Olá.";

  return {
    subject: "Redefinição de senha do Save Point Finança",
    message: [
      greeting,
      "",
      "Recebemos uma solicitação para redefinir a sua senha.",
      "Use o link abaixo para criar uma nova senha:",
      resetUrl,
      "",
      "Este link expira em 24 horas.",
      "Se você não solicitou esta alteração, ignore esta mensagem."
    ].join("\n")
  };
}
