import { z } from "zod";

function normalizeTokenValue(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim();

  if (!normalized) {
    return normalized;
  }

  const tokenParamMatch = normalized.match(/[?&]token=([a-f0-9]+)/i);
  if (tokenParamMatch?.[1]) {
    return tokenParamMatch[1];
  }

  const tokenMatch = normalized.match(/\b[a-f0-9]{48}\b/i);
  if (tokenMatch?.[0]) {
    return tokenMatch[0];
  }

  return normalized;
}

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Informe um e-mail valido")
});

export const resetPasswordSchema = z
  .object({
    token: z.preprocess(normalizeTokenValue, z.string().min(1, "Token obrigatorio")),
    newPassword: z.string().min(8, "Minimo de 8 caracteres"),
    confirmPassword: z.string().min(8, "Confirme a senha")
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas nao conferem"
  });

export const invitationSchema = z.object({
  email: z.string().trim().email("Informe um e-mail valido"),
  name: z.string().min(2, "Informe o nome do usuario"),
  role: z.enum(["admin", "member"])
});

export const acceptInvitationSchema = z
  .object({
    token: z.preprocess(normalizeTokenValue, z.string().min(1, "Token obrigatorio")),
    name: z.string().min(2, "Informe seu nome"),
    password: z.string().min(8, "Minimo de 8 caracteres"),
    confirmPassword: z.string().min(8, "Confirme a senha"),
    acceptTermsOfUse: z.boolean(),
    acceptPrivacyPolicy: z.boolean()
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas nao conferem"
  })
  .refine((value) => value.acceptTermsOfUse, {
    path: ["acceptTermsOfUse"],
    message: "Voce precisa aceitar os Termos de Uso"
  })
  .refine((value) => value.acceptPrivacyPolicy, {
    path: ["acceptPrivacyPolicy"],
    message: "Voce precisa aceitar a Politica de Privacidade"
  });

export const publicRegistrationSchema = z
  .object({
    plan: z.enum(["free", "trial", "pro"]),
    name: z.string().min(2, "Informe seu nome"),
    organizationName: z.string().min(2, "Informe o nome da conta"),
    email: z.string().trim().email("Informe um e-mail valido"),
    password: z.string().min(8, "Minimo de 8 caracteres"),
    confirmPassword: z.string().min(8, "Confirme a senha"),
    acceptTermsOfUse: z.boolean(),
    acceptPrivacyPolicy: z.boolean()
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas nao conferem"
  })
  .refine((value) => value.acceptTermsOfUse, {
    path: ["acceptTermsOfUse"],
    message: "Voce precisa aceitar os Termos de Uso"
  })
  .refine((value) => value.acceptPrivacyPolicy, {
    path: ["acceptPrivacyPolicy"],
    message: "Voce precisa aceitar a Politica de Privacidade"
  });

export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
export type InvitationValues = z.infer<typeof invitationSchema>;
export type AcceptInvitationValues = z.infer<typeof acceptInvitationSchema>;
export type PublicRegistrationValues = z.infer<typeof publicRegistrationSchema>;
