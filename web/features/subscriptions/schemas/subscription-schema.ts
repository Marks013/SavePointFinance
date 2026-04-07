import { z } from "zod";

import { dateKeySchema } from "@/lib/date";

export const subscriptionFormSchema = z
  .object({
    name: z.string().trim().min(2, "Informe um nome"),
    amount: z.coerce.number().positive("Informe um valor"),
    billingDay: z.coerce.number().int().min(1).max(31).default(1),
    categoryId: z.string().optional().nullable(),
    accountId: z.string().optional().nullable(),
    cardId: z.string().optional().nullable(),
    nextBillingDate: dateKeySchema,
    type: z.enum(["income", "expense"]).default("expense"),
    isActive: z.boolean().default(true),
    autoTithe: z.boolean().default(false)
  })
  .superRefine((value, ctx) => {
    if (value.type === "income" && value.cardId) {
      ctx.addIssue({
        code: "custom",
        path: ["cardId"],
        message: "Receitas recorrentes nao devem ser vinculadas a cartao"
      });
    }

    if (value.cardId && value.accountId) {
      ctx.addIssue({
        code: "custom",
        path: ["accountId"],
        message: "Assinaturas no credito devem ficar vinculadas ao cartao, nao a conta"
      });
    }

    if (!value.cardId && !value.accountId) {
      ctx.addIssue({
        code: "custom",
        path: ["accountId"],
        message: "Selecione a conta vinculada a assinatura"
      });
    }
  });

export type SubscriptionFormValues = z.infer<typeof subscriptionFormSchema>;
