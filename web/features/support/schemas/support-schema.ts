import { z } from "zod";

export const supportTopicValues = [
  "technical",
  "financial",
  "account_access",
  "cards_invoices",
  "subscriptions_installments",
  "billing_plan",
  "suggestion",
  "other"
] as const;

export const supportPriorityValues = ["low", "normal", "high", "urgent"] as const;

export const supportTopicLabels: Record<(typeof supportTopicValues)[number], string> = {
  technical: "Suporte técnico",
  financial: "Financeiro",
  account_access: "Conta e acesso",
  cards_invoices: "Cartões e faturas",
  subscriptions_installments: "Assinaturas e parcelamentos",
  billing_plan: "Plano e cobrança",
  suggestion: "Sugestão",
  other: "Outro assunto"
};

export const supportPriorityLabels: Record<(typeof supportPriorityValues)[number], string> = {
  low: "Baixa",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente"
};

export const supportRequestSchema = z.object({
  topic: z.enum(supportTopicValues),
  priority: z.enum(supportPriorityValues).default("normal"),
  subject: z.string().trim().min(6, "Descreva o assunto com um pouco mais de detalhe").max(120, "Assunto muito longo"),
  message: z.string().trim().min(30, "Explique o que aconteceu com pelo menos 30 caracteres").max(5000, "Mensagem muito longa"),
  contactEmail: z.string().trim().email("Informe um e-mail válido").max(160),
  contactName: z.string().trim().min(2, "Informe seu nome").max(100),
  allowAccountContext: z.boolean().default(true)
});

export type SupportRequestValues = z.infer<typeof supportRequestSchema>;
