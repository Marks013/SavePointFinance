import { z } from "zod";

export const transactionTypeValues = ["income", "expense", "transfer"] as const;
export const paymentMethodValues = ["pix", "money", "credit_card", "debit_card", "transfer"] as const;

export const transactionFormSchema = z
  .object({
    date: z.string().min(1, "Informe a data"),
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
    applyTithe: z.boolean().default(false)
  })
  .superRefine((value, ctx) => {
    if (value.type !== "income" && value.applyTithe) {
      ctx.addIssue({
        code: "custom",
        path: ["applyTithe"],
        message: "O dízimo automático só pode ser marcado em receitas"
      });
    }

    if (value.type === "transfer" && !value.accountId) {
      ctx.addIssue({
        code: "custom",
        path: ["accountId"],
        message: "Selecione a conta de origem da transferência"
      });
    }

    if (value.type === "transfer" && !value.destinationAccountId) {
      ctx.addIssue({
        code: "custom",
        path: ["destinationAccountId"],
        message: "Selecione a conta de destino da transferência"
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
        message: "Transferência não deve ser vinculada a cartão"
      });
    }

    if (value.type !== "transfer" && value.destinationAccountId) {
      ctx.addIssue({
        code: "custom",
        path: ["destinationAccountId"],
        message: "Conta de destino é usada apenas em transferências"
      });
    }

    if (value.paymentMethod === "credit_card" && !value.cardId) {
      ctx.addIssue({
        code: "custom",
        path: ["cardId"],
        message: "Selecione o cartão para lançamentos no crédito"
      });
    }

    if (value.paymentMethod === "credit_card" && value.accountId) {
      ctx.addIssue({
        code: "custom",
        path: ["accountId"],
        message: "Compras no crédito devem ficar vinculadas ao cartão, não à conta"
      });
    }

    if (value.paymentMethod !== "credit_card" && value.cardId) {
      ctx.addIssue({
        code: "custom",
        path: ["cardId"],
        message: "Selecione cartão apenas para compras no crédito"
      });
    }

    if (value.type !== "transfer" && value.paymentMethod !== "credit_card" && !value.accountId) {
      ctx.addIssue({
        code: "custom",
        path: ["accountId"],
        message: "Selecione a conta vinculada ao lançamento"
      });
    }

    if (value.cardId && value.installments > 1 && value.paymentMethod !== "credit_card") {
      ctx.addIssue({
        code: "custom",
        path: ["paymentMethod"],
        message: "Parcelamento exige cartão de crédito"
      });
    }
  });

export const transactionFiltersSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  from: z.string().optional().nullable(),
  to: z.string().optional().nullable(),
  type: z.enum(transactionTypeValues).optional().nullable(),
  categoryId: z.string().optional().nullable(),
  accountId: z.string().optional().nullable(),
  cardId: z.string().optional().nullable()
});

export type TransactionFormValues = z.infer<typeof transactionFormSchema>;
export type TransactionFiltersValues = z.infer<typeof transactionFiltersSchema>;
