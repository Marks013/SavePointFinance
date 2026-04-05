import { z } from "zod";

export const subscriptionFormSchema = z.object({
  name: z.string().trim().min(2, "Informe um nome"),
  amount: z.coerce.number().positive("Informe um valor"),
  billingDay: z.coerce.number().int().min(1).max(31).default(1),
  categoryId: z.string().optional().nullable(),
  accountId: z.string().optional().nullable(),
  cardId: z.string().optional().nullable(),
  nextBillingDate: z.string().min(1, "Informe a proxima cobranca"),
  type: z.enum(["income", "expense"]).default("expense"),
  isActive: z.boolean().default(true),
  autoTithe: z.boolean().default(false)
});

export type SubscriptionFormValues = z.infer<typeof subscriptionFormSchema>;
