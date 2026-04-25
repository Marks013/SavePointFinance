import { z } from "zod";

import { normalizeCalendarDate } from "@/lib/date";

export const transactionTypeValues = ["income", "expense", "transfer"] as const;
export const paymentMethodValues = ["pix", "money", "credit_card", "debit_card", "transfer"] as const;
export const transactionEditScopeValues = ["single", "group"] as const;

export const transactionFormSchema = z
  .object({
    date: z.coerce.date().transform((value) => normalizeCalendarDate(value)),
    amount: z.coerce.number().positive("Informe um valor maior que zero"),
    description: z.string().trim().min(3, "Informe uma descricao"),
    type: z.enum(transactionTypeValues),
    paymentMethod: z.enum(paymentMethodValues),
    categoryId: z.string().optional().nullable(),
    accountId: z.string().optional().nullable(),
    destinationAccountId: z.string().optional().nullable(),
    cardId: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    installments: z.coerce.number().int().min(1).max(120).default(1),
    competence: z.string().regex(/^\d{4}-\d{2}$/, "Formato invalido. Use YYYY-MM").optional(),
    applyTithe: z.boolean().default(false)
  })
  .superRefine((value, ctx) => {
    if (value.type !== "income" && value.applyTithe) {
      ctx.addIssue({
        code: "custom",
        path: ["applyTithe"],
        message: "O dizimo automatico so pode ser marcado em receitas"
      });
    }

    if (value.type === "transfer" && !value.accountId) {
      ctx.addIssue({
        code: "custom",
        path: ["accountId"],
        message: "Selecione a conta de origem da transferencia"
      });
    }

    if (value.type === "transfer" && !value.destinationAccountId) {
      ctx.addIssue({
        code: "custom",
        path: ["destinationAccountId"],
        message: "Selecione a conta de destino da transferencia"
      });
    }

    if (
      value.type === "transfer" &&
      value.accountId &&
      value.destinationAccountId &&
      value.accountId === value.destinationAccountId
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["destinationAccountId"],
        message: "A conta de destino deve ser diferente da conta de origem"
      });
    }

    if (value.type === "transfer" && value.cardId) {
      ctx.addIssue({
        code: "custom",
        path: ["cardId"],
        message: "Transferencia nao deve ser vinculada a cartao"
      });
    }

    if (value.type !== "transfer" && value.destinationAccountId) {
      ctx.addIssue({
        code: "custom",
        path: ["destinationAccountId"],
        message: "Conta de destino e usada apenas em transferencias"
      });
    }

    if (value.paymentMethod === "credit_card" && !value.cardId) {
      ctx.addIssue({
        code: "custom",
        path: ["cardId"],
        message: "Selecione o cartao para lancamentos no credito"
      });
    }

    if (value.paymentMethod === "credit_card" && value.accountId) {
      ctx.addIssue({
        code: "custom",
        path: ["accountId"],
        message: "Compras no credito devem ficar vinculadas ao cartao, nao a conta"
      });
    }

    if (value.paymentMethod !== "credit_card" && value.cardId) {
      ctx.addIssue({
        code: "custom",
        path: ["cardId"],
        message: "Selecione cartao apenas para compras no credito"
      });
    }

    if (value.type !== "transfer" && value.paymentMethod !== "credit_card" && !value.accountId) {
      ctx.addIssue({
        code: "custom",
        path: ["accountId"],
        message: "Selecione a conta vinculada ao lancamento"
      });
    }

    if (value.cardId && value.installments > 1 && value.paymentMethod !== "credit_card") {
      ctx.addIssue({
        code: "custom",
        path: ["paymentMethod"],
        message: "Parcelamento exige cartao de credito"
      });
    }
  });

export const transactionFiltersSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  month: z.string().regex(/^\d{4}-\d{2}$/, "Formato invalido. Use YYYY-MM").optional().nullable(),
  type: z.enum(transactionTypeValues).optional().nullable(),
  categoryId: z.string().optional().nullable(),
  accountId: z.string().optional().nullable(),
  cardId: z.string().optional().nullable(),
  accountUsage: z.enum(["standard", "benefit_food"]).optional().nullable()
});

export const transactionUpdateSchema = transactionFormSchema.extend({
  editScope: z.enum(transactionEditScopeValues).optional().default("single")
});

export type TransactionFormValues = z.infer<typeof transactionFormSchema>;
export type TransactionFiltersValues = z.infer<typeof transactionFiltersSchema>;
export type TransactionUpdateValues = z.infer<typeof transactionUpdateSchema>;
