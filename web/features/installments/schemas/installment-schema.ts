import { z } from "zod";

export const installmentGroupUpdateSchema = z.object({
  description: z.string().trim().min(3, "Informe uma descricao"),
  amount: z.coerce.number().positive("Informe um valor maior que zero").optional(),
  categoryId: z.string().optional().nullable(),
  notes: z.string().optional().nullable()
});

export const installmentReconcileSchema = z.object({
  action: z.literal("reconcile_due")
});

export type InstallmentGroupUpdateValues = z.infer<typeof installmentGroupUpdateSchema>;
