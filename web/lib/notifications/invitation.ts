import { buildPublicUrl } from "@/lib/app-url";

export function buildInvitationMessage(token: string, tenantName: string, userName?: string | null) {
  const inviteUrl = buildPublicUrl(`/accept-invitation?token=${token}`);
  const greeting = userName?.trim() ? `Olá, ${userName.trim()}.` : "Olá.";

  return {
    subject: `Convite para acessar ${tenantName}`,
    message: [
      greeting,
      "",
      `Você recebeu um convite para acessar a organização ${tenantName} no Save Point Finança.`,
      "Use o link abaixo para concluir o cadastro e definir sua senha:",
      inviteUrl,
      "",
      "Este convite expira em 7 dias.",
      "Se você não esperava este convite, ignore esta mensagem."
    ].join("\n")
  };
}
